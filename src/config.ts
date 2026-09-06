export const CHECK_INTERVAL_MINUTES = 10;
export const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;
export const RETENTION_DAYS = 21;
export const MAX_RECORDS = RETENTION_DAYS * 24 * 6 * 2;
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
