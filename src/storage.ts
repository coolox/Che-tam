import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_RECORDS, RETENTION_DAYS, STORAGE_KEY } from './config';
import { CanaryRecord } from './types';

export function applyRetention(records: CanaryRecord[], now = new Date()): CanaryRecord[] {
  const earliestMs = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return records
    .filter(record => Date.parse(record.timestampUtc) >= earliestMs)
    .sort((a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc))
    .slice(-MAX_RECORDS);
}

export async function loadRecords(): Promise<CanaryRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CanaryRecord[];
    return Array.isArray(parsed) ? applyRetention(parsed) : [];
  } catch {
    return [];
  }
}

export async function saveRecords(records: CanaryRecord[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(applyRetention(records)));
}

/** Keeps native-import retries idempotent without suppressing separate scheduled runs. */
export function deduplicateRecords(records: CanaryRecord[]): CanaryRecord[] {
  const seen = new Set<string>();
  return records.filter(record => {
    const key = `${record.checkRunKey}:${record.testType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function appendRecords(records: CanaryRecord[]): Promise<number> {
  const existing = await loadRecords();
  const retained = applyRetention(deduplicateRecords([...existing, ...records]));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
  return retained.length;
}

export function countFailuresSince(records: CanaryRecord[], since: Date): number {
  const sinceMs = since.getTime();
  return records.filter(record => !record.success && Date.parse(record.timestampUtc) >= sinceMs).length;
}

export function findLastSuccess(records: CanaryRecord[]): CanaryRecord | undefined {
  return [...records].reverse().find(record => record.success);
}
