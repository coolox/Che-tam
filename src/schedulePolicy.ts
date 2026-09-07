import {
  CHECK_INTERVAL_MS,
  FAILURE_RECOVERY_WINDOW_MS,
  HOURLY_CHECK_INTERVAL_MS,
  INITIAL_FAST_WINDOW_MS,
  MANUAL_CHECK_INTERVAL_MS,
} from './config';
import { CanaryRecord } from './types';

export interface ScheduleState {
  firstAttemptUtc?: string;
  lastAttemptUtc?: string;
  lastFailedAttemptUtc?: string;
}

interface CheckPair {
  records: CanaryRecord[];
  lastTimestampUtc: string;
}

function parseUtc(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function getScheduleState(records: CanaryRecord[]): ScheduleState {
  const ordered = [...records].sort(
    (a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc),
  );
  const pairs = groupCheckPairs(ordered);
  return {
    firstAttemptUtc: ordered[0]?.timestampUtc,
    lastAttemptUtc: ordered[ordered.length - 1]?.timestampUtc,
    lastFailedAttemptUtc: [...pairs].reverse().find(isFailedPair)
      ?.lastTimestampUtc,
  };
}

function groupCheckPairs(ordered: CanaryRecord[]): CheckPair[] {
  const pairs: CheckPair[] = [];
  const keyedPairs = new Map<string, CheckPair>();
  let unkeyedPair: CheckPair | undefined;

  for (const record of ordered) {
    if (record.checkPairKey) {
      const pair = keyedPairs.get(record.checkPairKey);
      if (pair) {
        pair.records.push(record);
        pair.lastTimestampUtc = record.timestampUtc;
      } else {
        const nextPair = { records: [record], lastTimestampUtc: record.timestampUtc };
        keyedPairs.set(record.checkPairKey, nextPair);
        pairs.push(nextPair);
      }
      continue;
    }

    if (!unkeyedPair || unkeyedPair.records.length === 2) {
      unkeyedPair = { records: [record], lastTimestampUtc: record.timestampUtc };
      pairs.push(unkeyedPair);
    } else {
      unkeyedPair.records.push(record);
      unkeyedPair.lastTimestampUtc = record.timestampUtc;
    }
  }

  return pairs;
}

function isFailedPair(pair: CheckPair): boolean {
  const testTypes = new Set(pair.records.map(record => record.testType));
  return (
    testTypes.has('https') &&
    testTypes.has('websocket') &&
    pair.records.every(record => !record.success)
  );
}

export function getScheduledIntervalMs(
  state: ScheduleState,
  now = new Date(),
): number {
  const firstAttemptMs = parseUtc(state.firstAttemptUtc);
  const lastFailedAttemptMs = parseUtc(state.lastFailedAttemptUtc);

  if (
    firstAttemptMs === undefined ||
    now.getTime() - firstAttemptMs < INITIAL_FAST_WINDOW_MS
  ) {
    return CHECK_INTERVAL_MS;
  }

  if (
    lastFailedAttemptMs !== undefined &&
    now.getTime() - lastFailedAttemptMs < FAILURE_RECOVERY_WINDOW_MS
  ) {
    return CHECK_INTERVAL_MS;
  }

  return HOURLY_CHECK_INTERVAL_MS;
}

export function shouldRunScheduledCheck(
  state: ScheduleState,
  now = new Date(),
): boolean {
  const lastAttemptMs = parseUtc(state.lastAttemptUtc);
  if (lastAttemptMs === undefined) {
    return true;
  }
  return now.getTime() - lastAttemptMs >= getScheduledIntervalMs(state, now);
}

export function getManualCheckWaitMs(
  lastAttemptUtc: string | undefined,
  now = new Date(),
): number {
  const lastAttemptMs = parseUtc(lastAttemptUtc);
  if (lastAttemptMs === undefined) {
    return 0;
  }
  return Math.max(0, lastAttemptMs + MANUAL_CHECK_INTERVAL_MS - now.getTime());
}

export function canRunManualCheck(
  lastAttemptUtc: string | undefined,
  now = new Date(),
): boolean {
  return getManualCheckWaitMs(lastAttemptUtc, now) === 0;
}

export function shouldThrottleManualCheck(
  lastAttemptUtc: string | undefined,
  now = new Date(),
): { throttled: true; waitMs: number } | { throttled: false } {
  const waitMs = getManualCheckWaitMs(lastAttemptUtc, now);
  if (waitMs > 0) {
    return { throttled: true, waitMs };
  }
  return { throttled: false };
}
