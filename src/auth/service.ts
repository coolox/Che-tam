import { isValidAuthSession, type SecureSessionStorage } from './sessionStorage';
import type {
  AuthAvailability,
  AuthErrorCategory,
  AuthResult,
  AuthSession,
  AuthState,
  AuthTransport,
  LoginRequest,
  RegisterRequest,
} from './types';

export const initialAuthState: AuthState = {
  status: 'checking',
  session: null,
  error: null,
};

export async function runAuthTransportAttempt<T>(
  availability: AuthAvailability,
  attempt: () => Promise<AuthResult<T>>,
): Promise<AuthResult<T>> {
  if (!availability.available) {
    return { ok: false, category: 'offline' };
  }

  return attempt();
}

export async function restoreLocalSession(storage: SecureSessionStorage): Promise<AuthState> {
  const stored = await storage.load();
  if (!stored) {
    return anonymousState(null);
  }

  if (!isValidAuthSession(stored)) {
    await storage.clear();
    return anonymousState('unknown');
  }

  return authenticatedState(stored);
}

export async function registerWithLocalSession(
  storage: SecureSessionStorage,
  transport: Pick<AuthTransport, 'register'>,
  availability: AuthAvailability,
  request: RegisterRequest,
): Promise<AuthState> {
  return persistSessionResult(storage, await runAuthTransportAttempt(availability, () => transport.register(request)));
}

export async function loginWithLocalSession(
  storage: SecureSessionStorage,
  transport: Pick<AuthTransport, 'login'>,
  availability: AuthAvailability,
  request: LoginRequest,
): Promise<AuthState> {
  return persistSessionResult(storage, await runAuthTransportAttempt(availability, () => transport.login(request)));
}

export async function logoutLocalSession(storage: Pick<SecureSessionStorage, 'clear'>): Promise<AuthState> {
  await storage.clear();
  return anonymousState(null);
}

export async function applyAuthFailure(
  storage: Pick<SecureSessionStorage, 'clear'>,
  category: AuthErrorCategory,
): Promise<AuthState> {
  if (category === 'session_expired' || category === 'device_replaced') {
    await storage.clear();
    return anonymousState(category);
  }

  return anonymousState(category);
}

async function persistSessionResult(storage: SecureSessionStorage, result: AuthResult<AuthSession>): Promise<AuthState> {
  if (!result.ok) {
    return applyAuthFailure(storage, result.category);
  }

  if (!isValidAuthSession(result.value)) {
    await storage.clear();
    return anonymousState('unknown');
  }

  await storage.save(result.value);
  return authenticatedState(result.value);
}

function authenticatedState(session: AuthSession): AuthState {
  return {
    status: 'authenticated',
    session,
    error: null,
  };
}

function anonymousState(error: AuthErrorCategory | null): AuthState {
  return {
    status: 'anonymous',
    session: null,
    error,
  };
}
