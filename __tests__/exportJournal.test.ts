import { createJournalExport } from '../src/exportJournal';
import { appendRecords } from '../src/storage';

const mockStore = new Map<string, string>();
const mockWritten = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  EncodingType: {
    UTF8: 'utf8',
  },
  writeAsStringAsync: jest.fn((uri: string, value: string) => {
    mockWritten.set(uri, value);
    return Promise.resolve();
  }),
}));

describe('journal export', () => {
  beforeEach(() => {
    mockStore.clear();
    mockWritten.clear();
  });

  it('writes a human-readable journal without internal ids or endpoint data', async () => {
    await appendRecords([
      {
        timestampUtc: '2026-01-31T12:00:00.000Z',
        testType: 'https',
        success: true,
        httpStatus: 204,
        latencyMs: 25,
        networkType: 'cellular',
        errorCategory: 'none',
      },
    ]);

    const uri = await createJournalExport();
    const content = mockWritten.get(uri) ?? '';

    expect(content).toContain('\n  "records"');
    expect(content).toContain('"timestampUtc"');
    expect(content).not.toContain('id');
    expect(content).not.toContain('endpoint');
    expect(content).not.toContain('secret');
  });
});
