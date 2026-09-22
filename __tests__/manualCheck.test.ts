import { shouldThrottleManualCheck } from '../src/schedulePolicy';
describe('manual v2 checks', () => { it('throttles another run for the 15-minute interval', () => expect(shouldThrottleManualCheck('2026-01-31T12:09:59.000Z', new Date('2026-01-31T12:10:00.000Z'))).toEqual({ throttled: true, waitMs: 899000 })); });
