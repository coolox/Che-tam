import { MAX_RECORDS, RETENTION_DAYS } from '../src/config';
import { appendRecords, applyRetention, loadRecords } from '../src/storage';
import { CanaryRecord } from '../src/types';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

function record(daysAgo: number, index: number, base = Date.UTC(2026, 0, 31)): CanaryRecord {
  return {
    timestampUtc: new Date(base - daysAgo * 86400000).toISOString(),
    testType: index % 2 === 0 ? 'https' : 'websocket',
    success: true,
    latencyMs: 12,
    networkType: 'wifi',
    errorCategory: 'none',
  };
}

describe('journal storage', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('keeps at least 21 days and removes older records first', () => {
    const now = new Date(Date.UTC(2026, 0, 31));
    const records = [record(22, 1), record(21, 2), record(1, 3)];

    expect(applyRetention(records, now)).toEqual([records[1], records[2]]);
  });

  it('caps storage to the configured record limit', () => {
    const now = new Date(Date.UTC(2026, 0, 31));
    const records = Array.from({ length: MAX_RECORDS + 8 }, (_, index) =>
      ({
        ...record(0, index),
        timestampUtc: new Date(now.getTime() - (MAX_RECORDS + 8 - index) * 1000).toISOString(),
      }),
    );

    const retained = applyRetention(records, now);

    expect(retained).toHaveLength(MAX_RECORDS);
    expect(retained[0]).toEqual(records[8]);
  });

  it('keeps 21 calendar days of adaptive checks plus throttled manual checks', () => {
    const start = Date.UTC(2026, 0, 1);
    const end = start + RETENTION_DAYS * 86400000;
    const records: CanaryRecord[] = [];
    const lastDayStart = end - 86400000;

    for (let timestamp = start; timestamp < lastDayStart; timestamp += 60 * 60000) {
      records.push(
        {
          ...record(0, records.length, end),
          timestampUtc: new Date(timestamp).toISOString(),
        },
        {
          ...record(0, records.length + 1, end),
          timestampUtc: new Date(timestamp + 1).toISOString(),
        },
      );
    }

    for (let timestamp = lastDayStart; timestamp < end; timestamp += 10 * 60000) {
      records.push(
        {
          ...record(0, records.length, end),
          timestampUtc: new Date(timestamp).toISOString(),
        },
        {
          ...record(0, records.length + 1, end),
          timestampUtc: new Date(timestamp + 1).toISOString(),
        },
      );
    }

    const retained = applyRetention(records, new Date(end));

    expect(retained).toHaveLength(records.length);
    expect(retained[0].timestampUtc).toBe(new Date(start).toISOString());
    expect(retained.at(-1)?.timestampUtc).toBe(
      new Date(end - 10 * 60000 + 1).toISOString(),
    );
  });

  it('persists appended records after retention', async () => {
    const now = Date.now();
    await appendRecords([
      record(RETENTION_DAYS + 1, 1, now),
      record(0, 2, now),
    ]);

    await expect(loadRecords()).resolves.toHaveLength(1);
  });
});
