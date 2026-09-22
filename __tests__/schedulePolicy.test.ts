import { CHECK_INTERVAL_MS, MANUAL_CHECK_INTERVAL_MS } from '../src/config';
import {
  acquireNativeCycleLease,
  getMissedCycleRecords,
  getNativeMissedCycleExpectedAtMs,
  getScheduleState,
  getScheduledCheckWaitMs,
  shouldRunScheduledCheck,
} from '../src/schedulePolicy';
import { CanaryRecord } from '../src/types';

function record(timestampUtc: string, testType: CanaryRecord['testType'] = 'http_domain'): CanaryRecord {
  return {
    timestampUtc,
    checkRunKey: 'run',
    testType,
    target: 'canary.example.test',
    success: true,
    httpStatus: 204,
    latencyMs: 12,
    phases: { dnsMs: null, tcpMs: null, tlsMs: null, httpMs: 12 },
    resolvedIp: null,
    networkType: 'wifi',
    carrier: null,
    appState: 'foreground',
    errorCategory: 'unknown',
    errorDetail: null,
  };
}

describe('15-minute v2 schedule policy', () => {
  const now = new Date('2026-01-31T12:00:00.000Z');

  it('runs immediately without an attempt and waits exactly 15 minutes after one', () => {
    expect(shouldRunScheduledCheck({}, now)).toBe(true);
    const state = getScheduleState([record('2026-01-31T11:45:01.000Z')]);
    expect(getScheduledCheckWaitMs(state, now)).toBe(1000);
    expect(shouldRunScheduledCheck(getScheduleState([record('2026-01-31T11:45:00.000Z')]), now)).toBe(true);
    expect(CHECK_INTERVAL_MS).toBe(15 * 60 * 1000);
    expect(MANUAL_CHECK_INTERVAL_MS).toBe(CHECK_INTERVAL_MS);
  });

  it('explicitly records every missed scheduled cycle with a permitted category', () => {
    const missed = getMissedCycleRecords({
      state: getScheduleState([record('2026-01-31T11:15:00.000Z')]),
      now,
      appState: 'background',
    });
    expect(missed.map(item => item.testType)).toEqual(['missed_cycle', 'missed_cycle']);
    expect(missed.every(item => item.errorCategory === 'unknown' && item.errorDetail?.includes('scheduled cycle'))).toBe(true);
  });

  it('grants one durable native lease and rejects an overlapping cycle', () => {
    const first = acquireNativeCycleLease({}, 10_000, 120_000);
    expect(first.acquired).toBe(true);
    expect(acquireNativeCycleLease(first.state, 10_001, 120_000).acquired).toBe(false);
    expect(acquireNativeCycleLease(first.state, 130_000, 120_000).acquired).toBe(true);
  });

  it('calculates native missed cycles from the persisted completed timestamp', () => {
    expect(getNativeMissedCycleExpectedAtMs(undefined, 4 * CHECK_INTERVAL_MS)).toEqual([]);
    expect(getNativeMissedCycleExpectedAtMs(0, 3 * CHECK_INTERVAL_MS + 1)).toEqual([
      CHECK_INTERVAL_MS,
      2 * CHECK_INTERVAL_MS,
    ]);
  });
});
