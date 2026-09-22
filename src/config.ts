import Constants from 'expo-constants';

export const CHECK_INTERVAL_MINUTES = 15;
export const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60 * 1000;
export const MANUAL_CHECK_INTERVAL_MS = CHECK_INTERVAL_MS;
export const RETENTION_DAYS = 21;
const CHECKS_PER_DAY = (24 * 60) / CHECK_INTERVAL_MINUTES;
const RECORDS_PER_RUN = 6; // Five probe records plus an occasional missed-cycle marker.
export const MAX_RECORDS = RETENTION_DAYS * CHECKS_PER_DAY * RECORDS_PER_RUN;
export const REQUEST_TIMEOUT_MS = 15_000;
export const STORAGE_KEY = 'hearth-canary-journal-v2';
export const BACKGROUND_TASK_NAME = 'hearth-canary-background-check-v2';

export interface CanaryTargets {
  endpoint?: string;
  controlDns?: string;
  controlHttp?: string;
}

function validHttpsUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized.includes('example.invalid')) {
    return undefined;
  }
  try {
    return new URL(normalized).protocol === 'https:' ? normalized : undefined;
  } catch {
    return undefined;
  }
}

export function parseConfiguredEndpoint(endpoint?: string): string | undefined {
  return validHttpsUrl(endpoint);
}

export function getConfiguredTargets(): CanaryTargets {
  const extra = Constants.expoConfig?.extra as
    | { canaryEndpoint?: string; canaryControlDns?: string; canaryControlHttp?: string }
    | undefined;
  return {
    endpoint: validHttpsUrl(extra?.canaryEndpoint),
    controlDns: extra?.canaryControlDns?.trim() || undefined,
    controlHttp: validHttpsUrl(extra?.canaryControlHttp),
  };
}

export function getConfiguredEndpoint(): string | undefined {
  return getConfiguredTargets().endpoint;
}

export function toWebSocketEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS endpoint is supported');
  }
  url.protocol = 'wss:';
  return url.toString();
}
