import { runConnectivityCheck } from '../src/checks';
import { loadRecords } from '../src/storage';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

class MockWebSocket {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    setTimeout(() => this.onopen?.(), 0);
  }

  close() {}
}

describe('connectivity checks', () => {
  beforeEach(() => {
    mockStore.clear();
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 204 } as Response),
    );
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  it('records HTTPS and WebSocket outcomes for a manual mock check', async () => {
    const result = await runConnectivityCheck({
      endpoint: 'https://127.0.0.1:8443/hearth-canary/',
      networkType: 'wifi',
    });

    expect(result.records.map(record => record.testType).sort()).toEqual([
      'https',
      'websocket',
    ]);
    expect(result.records.every(record => record.success)).toBe(true);
    await expect(loadRecords()).resolves.toHaveLength(2);
  });
});
