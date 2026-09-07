import {
  CHECK_INTERVAL_MS,
  FAILURE_RECOVERY_WINDOW_MS,
  HOURLY_CHECK_INTERVAL_MS,
  INITIAL_FAST_WINDOW_MS,
  MANUAL_CHECK_INTERVAL_MS,
} from '../src/config';
import {
  canRunManualCheck,
  getScheduleState,
  getManualCheckWaitMs,
  getScheduledIntervalMs,
  shouldRunScheduledCheck,
} from '../src/schedulePolicy';
import { CanaryRecord, CanaryTestType } from '../src/types';

function canaryRecord(params: {
  timestampUtc: string;
  checkPairKey: string;
  testType: CanaryTestType;
  success: boolean;
}): CanaryRecord {
  return {
    ...params,
    latencyMs: 12,
    networkType: 'wifi',
    errorCategory: params.success ? 'none' : 'timeout',
  };
}

function checkPair(params: {
  timestampMs: number;
  checkPairKey: string;
  httpsSuccess: boolean;
  websocketSuccess: boolean;
}): CanaryRecord[] {
  return [
    canaryRecord({
      timestampUtc: new Date(params.timestampMs).toISOString(),
      checkPairKey: params.checkPairKey,
      testType: 'https',
      success: params.httpsSuccess,
    }),
    canaryRecord({
      timestampUtc: new Date(params.timestampMs + 1).toISOString(),
      checkPairKey: params.checkPairKey,
      testType: 'websocket',
      success: params.websocketSuccess,
    }),
  ];
}

describe('traffic scheduling policy', () => {
  const now = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));

  it('uses the fast cadence for the first 24 hours', () => {
    const firstAttemptUtc = new Date(
      now.getTime() - INITIAL_FAST_WINDOW_MS + 1,
    ).toISOString();

    expect(getScheduledIntervalMs({ firstAttemptUtc }, now)).toBe(CHECK_INTERVAL_MS);
  });

  it('switches to hourly after the initial window', () => {
    const firstAttemptUtc = new Date(now.getTime() - INITIAL_FAST_WINDOW_MS).toISOString();

    expect(getScheduledIntervalMs({ firstAttemptUtc }, now)).toBe(
      HOURLY_CHECK_INTERVAL_MS,
    );
  });

  it('returns to the fast cadence for an hour after a failed pair', () => {
    const firstAttemptUtc = new Date(now.getTime() - INITIAL_FAST_WINDOW_MS).toISOString();
    const lastFailedAttemptUtc = new Date(
      now.getTime() - FAILURE_RECOVERY_WINDOW_MS + 1,
    ).toISOString();

    expect(
      getScheduledIntervalMs({ firstAttemptUtc, lastFailedAttemptUtc }, now),
    ).toBe(CHECK_INTERVAL_MS);
  });

  it('falls back to hourly after failure recovery ends', () => {
    const firstAttemptUtc = new Date(now.getTime() - INITIAL_FAST_WINDOW_MS).toISOString();
    const lastFailedAttemptUtc = new Date(
      now.getTime() - FAILURE_RECOVERY_WINDOW_MS,
    ).toISOString();

    expect(
      getScheduledIntervalMs({ firstAttemptUtc, lastFailedAttemptUtc }, now),
    ).toBe(HOURLY_CHECK_INTERVAL_MS);
  });

  it('keeps hourly cadence after the first 24 hours for a partial pair', () => {
    const records = [
      ...checkPair({
        timestampMs: now.getTime() - INITIAL_FAST_WINDOW_MS,
        checkPairKey: 'first-success',
        httpsSuccess: true,
        websocketSuccess: true,
      }),
      ...checkPair({
        timestampMs: now.getTime() - CHECK_INTERVAL_MS,
        checkPairKey: 'latest-partial',
        httpsSuccess: true,
        websocketSuccess: false,
      }),
    ];

    expect(getScheduledIntervalMs(getScheduleState(records), now)).toBe(
      HOURLY_CHECK_INTERVAL_MS,
    );
  });

  it('activates 60-minute fast recovery for a fully failed pair', () => {
    const records = [
      ...checkPair({
        timestampMs: now.getTime() - INITIAL_FAST_WINDOW_MS,
        checkPairKey: 'first-success',
        httpsSuccess: true,
        websocketSuccess: true,
      }),
      ...checkPair({
        timestampMs: now.getTime() - FAILURE_RECOVERY_WINDOW_MS + 1,
        checkPairKey: 'latest-failed',
        httpsSuccess: false,
        websocketSuccess: false,
      }),
    ];

    expect(getScheduledIntervalMs(getScheduleState(records), now)).toBe(
      CHECK_INTERVAL_MS,
    );
  });

  it('does not extend completed recovery when a later pair is partial', () => {
    const records = [
      ...checkPair({
        timestampMs: now.getTime() - INITIAL_FAST_WINDOW_MS,
        checkPairKey: 'first-success',
        httpsSuccess: true,
        websocketSuccess: true,
      }),
      ...checkPair({
        timestampMs: now.getTime() - FAILURE_RECOVERY_WINDOW_MS - 1,
        checkPairKey: 'old-failed',
        httpsSuccess: false,
        websocketSuccess: false,
      }),
      ...checkPair({
        timestampMs: now.getTime() - CHECK_INTERVAL_MS,
        checkPairKey: 'later-partial',
        httpsSuccess: true,
        websocketSuccess: false,
      }),
    ];

    expect(getScheduleState(records).lastFailedAttemptUtc).toBe(
      new Date(now.getTime() - FAILURE_RECOVERY_WINDOW_MS).toISOString(),
    );
    expect(getScheduledIntervalMs(getScheduleState(records), now)).toBe(
      HOURLY_CHECK_INTERVAL_MS,
    );
  });

  it('runs when there is no previous attempt and respects the chosen interval', () => {
    expect(shouldRunScheduledCheck({}, now)).toBe(true);

    const firstAttemptUtc = new Date(
      now.getTime() - INITIAL_FAST_WINDOW_MS + 1,
    ).toISOString();
    const tooRecent = new Date(now.getTime() - MANUAL_CHECK_INTERVAL_MS + 1).toISOString();
    const due = new Date(now.getTime() - CHECK_INTERVAL_MS).toISOString();

    expect(shouldRunScheduledCheck({ firstAttemptUtc, lastAttemptUtc: tooRecent }, now)).toBe(false);
    expect(shouldRunScheduledCheck({ firstAttemptUtc, lastAttemptUtc: due }, now)).toBe(true);
  });

  it('throttles manual checks to one pair per 10 minutes', () => {
    const lastAttemptUtc = new Date(now.getTime() - MANUAL_CHECK_INTERVAL_MS + 1).toISOString();

    expect(canRunManualCheck(lastAttemptUtc, now)).toBe(false);
    expect(getManualCheckWaitMs(lastAttemptUtc, now)).toBe(1);
    expect(
      canRunManualCheck(
        new Date(now.getTime() - MANUAL_CHECK_INTERVAL_MS).toISOString(),
        now,
      ),
    ).toBe(true);
  });
});
