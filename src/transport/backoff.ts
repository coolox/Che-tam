export const TRANSPORT_INITIAL_RETRY_DELAY_MS = 1000;
export const TRANSPORT_RETRY_MULTIPLIER = 2;
export const TRANSPORT_RETRY_JITTER_RATIO = 0.25;
export const TRANSPORT_MAX_RETRY_DELAY_MS = 60000;

export type JitterSource = () => number;

export function calculateRetryDelayMs(attempt: number, jitter: JitterSource): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exponentialDelay = TRANSPORT_INITIAL_RETRY_DELAY_MS * TRANSPORT_RETRY_MULTIPLIER ** safeAttempt;
  const cappedBaseDelay = Math.min(exponentialDelay, TRANSPORT_MAX_RETRY_DELAY_MS);
  const normalizedJitter = Math.min(1, Math.max(0, jitter()));
  const jitterOffset = (normalizedJitter * 2 - 1) * TRANSPORT_RETRY_JITTER_RATIO;
  const jitteredDelay = cappedBaseDelay + cappedBaseDelay * jitterOffset;

  return Math.max(0, Math.min(TRANSPORT_MAX_RETRY_DELAY_MS, Math.round(jitteredDelay)));
}
