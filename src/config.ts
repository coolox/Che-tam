export const CHECK_INTERVAL_MINUTES = 10;
export const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;
export const HOURLY_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const INITIAL_FAST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FAILURE_RECOVERY_WINDOW_MS = 60 * 60 * 1000;
export const MANUAL_CHECK_INTERVAL_MS = CHECK_INTERVAL_MS;
export const RETENTION_DAYS = 21;
const CHECKS_PER_DAY = (24 * 60) / CHECK_INTERVAL_MINUTES;
const MAX_PAIRS_PER_10_MINUTES = 2;
export const MAX_RECORDS = RETENTION_DAYS * CHECKS_PER_DAY * MAX_PAIRS_PER_10_MINUTES * 2;
export const REQUEST_TIMEOUT_MS = 15000;
export const STORAGE_KEY = 'hearth-canary-journal-v1';
export const BACKGROUND_TASK_NAME = 'hearth-canary-background-check';

export function getConfiguredEndpoint(): string | undefined {
  const endpoint = process.env.EXPO_PUBLIC_CANARY_ENDPOINT?.trim();
  return endpoint && !endpoint.includes('example.invalid') ? endpoint : undefined;
}

export function toWebSocketEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    throw new Error('Unsupported endpoint protocol');
  }
  return url.toString();
}
