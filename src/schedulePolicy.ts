import { CHECK_INTERVAL_MS, MANUAL_CHECK_INTERVAL_MS } from './config';
import { CanaryRecord } from './types';

export interface ScheduleState {
  firstAttemptUtc?: string;
  lastAttemptUtc?: string;
}

/** Platform-independent mirror of the native SharedPreferences lease decision. */
export interface NativeCycleLeaseState {
  leaseUntilMs?: number;
  lastNativeCycleCompletedAtMs?: number;
}

export function acquireNativeCycleLease(
  state: NativeCycleLeaseState,
  nowMs: number,
  leaseDurationMs = 2 * 60 * 1000,
): { acquired: boolean; state: NativeCycleLeaseState } {
  if ((state.leaseUntilMs ?? 0) > nowMs) return { acquired: false, state };
  return { acquired: true, state: { ...state, leaseUntilMs: nowMs + leaseDurationMs } };
}

export function getNativeMissedCycleExpectedAtMs(
  lastNativeCycleCompletedAtMs: number | undefined,
  nowMs: number,
  intervalMs = CHECK_INTERVAL_MS,
): number[] {
  if (lastNativeCycleCompletedAtMs === undefined) return [];
  const expected: number[] = [];
  // The runner that observes the gap satisfies the newest due slot; older slots are missed.
  for (let atMs = lastNativeCycleCompletedAtMs + intervalMs; atMs + intervalMs <= nowMs; atMs += intervalMs) expected.push(atMs);
  return expected;
}

function parseUtc(value: string | undefined): number | undefined {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function getScheduleState(records: CanaryRecord[]): ScheduleState {
  const attempts = records
    .filter(record => record.testType !== 'missed_cycle')
    .sort((a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc));
  return {
    firstAttemptUtc: attempts[0]?.timestampUtc,
    lastAttemptUtc: attempts.at(-1)?.timestampUtc,
  };
}

export function getScheduledIntervalMs(): number {
  return CHECK_INTERVAL_MS;
}

export function getScheduledCheckWaitMs(
  state: ScheduleState,
  now = new Date(),
): number {
  const lastAttemptMs = parseUtc(state.lastAttemptUtc);
  return lastAttemptMs === undefined
    ? 0
    : Math.max(0, lastAttemptMs + CHECK_INTERVAL_MS - now.getTime());
}

export function shouldRunScheduledCheck(state: ScheduleState, now = new Date()): boolean {
  return getScheduledCheckWaitMs(state, now) === 0;
}

export function getManualCheckWaitMs(
  lastAttemptUtc: string | undefined,
  now = new Date(),
): number {
  const lastAttemptMs = parseUtc(lastAttemptUtc);
  return lastAttemptMs === undefined
    ? 0
    : Math.max(0, lastAttemptMs + MANUAL_CHECK_INTERVAL_MS - now.getTime());
}

export function canRunManualCheck(lastAttemptUtc: string | undefined, now = new Date()): boolean {
  return getManualCheckWaitMs(lastAttemptUtc, now) === 0;
}

export function shouldThrottleManualCheck(
  lastAttemptUtc: string | undefined,
  now = new Date(),
): { throttled: true; waitMs: number } | { throttled: false } {
  const waitMs = getManualCheckWaitMs(lastAttemptUtc, now);
  return waitMs > 0 ? { throttled: true, waitMs } : { throttled: false };
}

export function createMissedCycleRecord(params: {
  expectedAtUtc: string;
  observedAtUtc?: string;
  appState: CanaryRecord['appState'];
}): CanaryRecord {
  const timestampUtc = params.observedAtUtc ?? new Date().toISOString();
  return {
    timestampUtc,
    checkRunKey: `missed:${params.expectedAtUtc}`,
    testType: 'missed_cycle',
    target: 'scheduled_cycle',
    success: false,
    httpStatus: null,
    latencyMs: 0,
    phases: { dnsMs: null, tcpMs: null, tlsMs: null, httpMs: null },
    resolvedIp: null,
    networkType: 'unknown',
    carrier: null,
    appState: params.appState,
    errorCategory: 'unknown',
    errorDetail: 'scheduled cycle was not observed at its expected time',
  };
}

export function getMissedCycleRecords(params: {
  state: ScheduleState;
  now?: Date;
  appState: CanaryRecord['appState'];
}): CanaryRecord[] {
  const now = params.now ?? new Date();
  const lastAttemptMs = parseUtc(params.state.lastAttemptUtc);
  if (lastAttemptMs === undefined || now.getTime() - lastAttemptMs <= CHECK_INTERVAL_MS) {
    return [];
  }
  const missed: CanaryRecord[] = [];
  for (
    let expected = lastAttemptMs + CHECK_INTERVAL_MS;
    expected < now.getTime();
    expected += CHECK_INTERVAL_MS
  ) {
    missed.push(
      createMissedCycleRecord({
        expectedAtUtc: new Date(expected).toISOString(),
        observedAtUtc: now.toISOString(),
        appState: params.appState,
      }),
    );
  }
  return missed;
}
