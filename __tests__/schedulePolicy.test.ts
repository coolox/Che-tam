import { CHECK_INTERVAL_MS } from '../src/config';
import {
  estimateMonthlyTrafficKb,
  shouldRunScheduledCheck,
} from '../src/schedulePolicy';

describe('traffic scheduling policy', () => {
  const now = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));

  it('runs when there is no previous attempt', () => {
    expect(shouldRunScheduledCheck(undefined, now)).toBe(true);
  });

  it('waits until the 10 minute interval has elapsed', () => {
    const tooRecent = new Date(now.getTime() - CHECK_INTERVAL_MS + 1).toISOString();
    const due = new Date(now.getTime() - CHECK_INTERVAL_MS).toISOString();

    expect(shouldRunScheduledCheck(tooRecent, now)).toBe(false);
    expect(shouldRunScheduledCheck(due, now)).toBe(true);
  });

  it('keeps the normal monthly traffic estimate below 5 MB', () => {
    expect(estimateMonthlyTrafficKb()).toBe(4320);
    expect(estimateMonthlyTrafficKb()).toBeLessThan(5 * 1024);
  });
});
