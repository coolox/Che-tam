// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: string): string;
};

import { calculateRetryDelayMs, TRANSPORT_MAX_RETRY_DELAY_MS } from '../src/transport/backoff';
import { runTransportAttempt } from '../src/transport/contract';
import { buildTransportDiagnosticsViewModel } from '../src/transport/diagnostics';
import {
  classifyDnsPolicy,
  EndpointPolicyRepository,
  recordEndpointResult,
  selectEndpoint,
  updateEndpointList,
  type EndpointRecord,
  type KeyValueStorage,
} from '../src/transport/endpointPolicy';

class MemoryStorage implements KeyValueStorage {
  constructor(private readonly values = new Map<string, string>()) {}

  getItem(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function source(endpoints: EndpointRecord[]) {
  return { loadEndpoints: () => Promise.resolve(endpoints) };
}

describe('APP-005 transport policy', () => {
  it('does not run a transport attempt when availability is offline', async () => {
    const attempt = jest.fn(async () => ({ ok: true as const, body: 'unused' }));

    await expect(runTransportAttempt({ available: false }, attempt)).resolves.toEqual({
      ok: false,
      category: 'offline',
    });
    expect(attempt).not.toHaveBeenCalled();
  });

  it('validates endpoint updates and keeps last-known-good after repository reload', async () => {
    const storage = new MemoryStorage();
    const repository = new EndpointPolicyRepository(storage);

    await expect(updateEndpointList(repository, source([
      { id: 'reserve-b', priority: 2 },
      { id: 'primary-a', priority: 1 },
    ]))).resolves.toMatchObject({ updated: true });
    await recordEndpointResult(repository, { ok: true, endpointId: 'reserve-b' });

    const reloaded = new EndpointPolicyRepository(storage);
    expect(selectEndpoint(await reloaded.load())?.id).toBe('reserve-b');

    await expect(updateEndpointList(reloaded, source([
      { id: 'broken', priority: 1 },
      { id: 'broken', priority: 2 },
    ]))).resolves.toMatchObject({ updated: false });
    expect(selectEndpoint(await reloaded.load())?.id).toBe('reserve-b');

    await expect(updateEndpointList(reloaded, source([{ id: 'bad-priority', priority: -1 }]))).resolves.toMatchObject({
      updated: false,
    });
    expect(selectEndpoint(await reloaded.load())?.id).toBe('reserve-b');
  });

  it('falls back deterministically when last-known-good is unavailable', async () => {
    const repository = new EndpointPolicyRepository(new MemoryStorage());
    await updateEndpointList(repository, source([
      { id: 'reserve-b', priority: 1 },
      { id: 'reserve-a', priority: 1 },
      { id: 'last-good', priority: 9 },
    ]));
    await recordEndpointResult(repository, { ok: true, endpointId: 'last-good' });
    await recordEndpointResult(repository, {
      ok: false,
      endpointId: 'last-good',
      category: 'endpoint_failure',
      markUnavailable: true,
    });

    expect(selectEndpoint(await repository.load())?.id).toBe('reserve-a');
  });

  it('classifies loopback, unspecified, and tampering results as address_blocked only', () => {
    for (const answer of ['127.0.0.1', '0.0.0.0', '::1', '::']) {
      expect(classifyDnsPolicy({ answers: [answer] })).toBe('address_blocked');
    }

    expect(classifyDnsPolicy({ answers: [], tamperingDetected: true })).toBe('address_blocked');
    expect(classifyDnsPolicy({ answers: ['opaque-id-only'] })).toBeNull();
  });

  it('aggregates explicit non-negative bytes by opaque endpoint and direction', async () => {
    const repository = new EndpointPolicyRepository(new MemoryStorage());
    await updateEndpointList(repository, source([{ id: 'endpoint-a', priority: 1 }]));
    await recordEndpointResult(repository, { ok: true, endpointId: 'endpoint-a', bytes: { sent: 10, received: 4 } });
    await recordEndpointResult(repository, {
      ok: false,
      endpointId: 'endpoint-a',
      category: 'endpoint_failure',
      bytes: { sent: -1, received: 6 },
    });

    expect((await repository.load()).counters).toEqual({ 'endpoint-a': { sent: 10, received: 10 } });
  });

  it('calculates bounded deterministic backoff without timers or loops', () => {
    expect(calculateRetryDelayMs(0, () => 0)).toBe(750);
    expect(calculateRetryDelayMs(1, () => 0.5)).toBe(2000);
    expect(calculateRetryDelayMs(2, () => 1)).toBe(5000);
    expect(calculateRetryDelayMs(99, () => 1)).toBe(TRANSPORT_MAX_RETRY_DELAY_MS);
    expect(calculateRetryDelayMs(-1, () => 0)).toBe(750);
  });

  it('builds a Russian safe diagnostics model without address, raw answer, or exception disclosure', async () => {
    const repository = new EndpointPolicyRepository(new MemoryStorage());
    await updateEndpointList(repository, source([{ id: 'endpoint-a', priority: 1 }]));
    await recordEndpointResult(repository, { ok: true, endpointId: 'endpoint-a', bytes: { sent: 2, received: 3 } });

    const model = buildTransportDiagnosticsViewModel({
      snapshot: await repository.load(),
      category: 'address_blocked',
      retryAttempt: 1,
      jitter: () => 0.5,
    });
    const serialized = JSON.stringify(model);

    expect(model).toEqual({
      connectionCategory: 'Адрес заблокирован',
      selectedEndpointId: 'endpoint-a',
      lastKnownGoodEndpointId: 'endpoint-a',
      byteCounters: [{ endpointId: 'endpoint-a', sent: 2, received: 3 }],
      nextRetryDelayMs: 2000,
    });
    expect(serialized).not.toMatch(/127\.0\.0\.1|0\.0\.0\.0|::1|https?:|Error:|stack/i);
  });

  it('keeps new transport files free of concrete network-capable code', () => {
    const transportDir = 'src/transport';
    const files = fs.readdirSync(transportDir).filter(file => file.endsWith('.ts'));
    const combined = files.map(file => fs.readFileSync(`${transportDir}/${file}`, 'utf8')).join('\n');

    expect(combined).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|EventSource|setTimeout|setInterval)\b/);
    expect(combined).not.toMatch(/\b(net|tls|dns|dgram|http|https):/i);
    expect(combined).not.toMatch(/https?:\/\//i);
  });
});
