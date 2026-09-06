import { shouldThrottleManualCheck } from '../src/schedulePolicy';

describe('manual canary checks', () => {
  it('does not run a new pair when the manual throttle window is active', () => {
    expect(
      shouldThrottleManualCheck(
        '2026-01-31T12:09:59.000Z',
        new Date('2026-01-31T12:10:00.000Z'),
      ),
    ).toEqual({ throttled: true, waitMs: 599000 });
  });
});
