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
  return {
    firstAttemptUtc: ordered[0]?.timestampUtc,
    lastAttemptUtc: ordered[ordered.length - 1]?.timestampUtc,
    lastFailedAttemptUtc: [...ordered].reverse().find(record => !record.success)
      ?.timestampUtc,
  };
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
