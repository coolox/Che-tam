import * as FileSystem from 'expo-file-system/legacy';

import { loadRecords } from './storage';

const EXPORT_FILE_NAME = 'hearth-canary-journal.json';

export async function createJournalExport(): Promise<string> {
  const records = await loadRecords();
  const uri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${EXPORT_FILE_NAME}`;
  const journal = {
    format: 'hearth-canary-journal-v1',
    exportedAtUtc: new Date().toISOString(),
    recordCount: records.length,
    fields: [
      'timestampUtc',
      'testType',
      'success',
      'httpStatus',
      'latencyMs',
      'networkType',
      'errorCategory',
    ],
    records,
  };

  await FileSystem.writeAsStringAsync(uri, JSON.stringify(journal, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return uri;
}
