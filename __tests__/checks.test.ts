import { parseConfiguredEndpoint } from '../src/config';
import { runConnectivityCheck } from '../src/checks';
import { loadRecords } from '../src/storage';
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)), setItem: jest.fn((key: string, value: string) => { mockStore.set(key, value); return Promise.resolve(); }) }));
class MockWebSocket { onopen: (() => void) | null = null; onerror: (() => void) | null = null; constructor() { setTimeout(() => this.onopen?.(), 0); } close() {} }
describe('v2 independent connectivity run', () => {
  beforeEach(() => { mockStore.clear(); globalThis.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 204 } as Response)); globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket; });
  it('uses an HTTPS non-placeholder endpoint', () => { expect(parseConfiguredEndpoint('https://canary.example.test/')).toBe('https://canary.example.test/'); expect(parseConfiguredEndpoint('https://example.invalid/')).toBeUndefined(); expect(parseConfiguredEndpoint('http://canary.example.test/')).toBeUndefined(); });
  it('writes all five independent v2 results with a shared run key', async () => {
    const result = await runConnectivityCheck({ endpoint: 'https://canary.example.test/', controlDns: 'https://control.example.test/', controlHttp: 'https://control-http.example.test/', networkType: 'wifi' });
    expect(result.records.map(record => record.testType).sort()).toEqual(['control_dns', 'control_http', 'dns_resolve', 'http_domain', 'ws_domain']);
    expect(new Set(result.records.map(record => record.checkRunKey)).size).toBe(1);
    expect(result.records.every(record => 'target' in record && 'phases' in record && 'appState' in record)).toBe(true);
    expect(result.records.find(record => record.testType === 'dns_resolve')).toMatchObject({ errorCategory: 'unknown', errorDetail: expect.stringContaining('native Android') });
    await expect(loadRecords()).resolves.toHaveLength(5);
  });
  it('settles each of the five check slots even when the HTTP request fails', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('Network request failed')));
    const result = await runConnectivityCheck({ endpoint: 'https://canary.example.test/', controlDns: 'https://control.example.test/', controlHttp: 'https://control-http.example.test/', networkType: 'cellular' });
    expect(result.records).toHaveLength(5);
    expect(result.records.map(record => record.testType).sort()).toEqual(['control_dns', 'control_http', 'dns_resolve', 'http_domain', 'ws_domain']);
    expect(result.records.filter(record => ['control_dns', 'control_http', 'http_domain'].includes(record.testType)).every(record => record.success === false)).toBe(true);
    expect(result.records.find(record => record.testType === 'ws_domain')?.success).toBe(true);
  });
});
