import type { AuthSession } from './types';

export type SecureSessionStorage = {
  load(): Promise<AuthSession | null>;
  save(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
};

export function isValidAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof AuthSession, unknown>>;
  return (
    isNonEmptyOpaqueText(candidate.sessionId) &&
    isNonEmptyOpaqueText(candidate.accountId) &&
    isNonEmptyOpaqueText(candidate.profileId) &&
    isNonEmptyOpaqueText(candidate.deviceId)
  );
}

function isNonEmptyOpaqueText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
