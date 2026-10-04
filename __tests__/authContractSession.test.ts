// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: string): string;
};

import {
  applyAuthFailure,
  buildAuthViewModel,
  getAuthErrorMessage,
  isValidAuthSession,
  loginWithLocalSession,
  logoutLocalSession,
  registerWithLocalSession,
  resolveAuthRoute,
  restoreLocalSession,
  runAuthTransportAttempt,
  validateInviteInput,
  validateLoginInput,
  type AuthSession,
  type AuthTransport,
  type SecureSessionStorage,
} from '../src/auth';

class MemorySecureSessionStorage implements SecureSessionStorage {
  public saved: unknown = null;
  public clearCount = 0;

  constructor(initial: unknown = null) {
    this.saved = initial;
  }

  load(): Promise<AuthSession | null> {
    return Promise.resolve(this.saved as AuthSession | null);
  }

  save(session: AuthSession): Promise<void> {
    this.saved = { ...session };
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.saved = null;
    this.clearCount += 1;
    return Promise.resolve();
  }
}

const validSession: AuthSession = {
  sessionId: 'session-local-1',
  accountId: 'account-local-1',
  profileId: 'profile-local-1',
  deviceId: 'device-local-1',
};

function fakeTransport(session: AuthSession): AuthTransport {
  return {
    redeemInvite: jest.fn(async () => ({ ok: true as const, value: { inviteId: 'invite-local-1' } })),
    register: jest.fn(async () => ({ ok: true as const, value: session })),
    login: jest.fn(async () => ({ ok: true as const, value: session })),
    restore: jest.fn(async () => ({ ok: true as const, value: session })),
    bindDevice: jest.fn(async () => ({ ok: true as const, value: session })),
    logout: jest.fn(async () => ({ ok: true as const, value: null })),
  };
}

describe('APP-006 auth contract and local session', () => {
  it('keeps auth attempts behind the offline policy', async () => {
    const attempt = jest.fn(async () => ({ ok: true as const, value: validSession }));

    await expect(runAuthTransportAttempt({ available: false }, attempt)).resolves.toEqual({
      ok: false,
      category: 'offline',
    });
    expect(attempt).not.toHaveBeenCalled();
  });

  it('has one secure-session interface and restores only valid session data', async () => {
    const files = fs.readdirSync('src/auth').filter(file => file.endsWith('.ts'));
    const combined = files.map(file => fs.readFileSync(`src/auth/${file}`, 'utf8')).join('\n');

    expect((combined.match(/type SecureSessionStorage =/g) ?? [])).toHaveLength(1);
    expect(isValidAuthSession(validSession)).toBe(true);

    await expect(restoreLocalSession(new MemorySecureSessionStorage(validSession))).resolves.toEqual({
      status: 'authenticated',
      session: validSession,
      error: null,
    });

    const malformedStorage = new MemorySecureSessionStorage({
      accountId: 'account-local-1',
      profileId: 'profile-local-1',
      deviceId: 'device-local-1',
    });
    await expect(restoreLocalSession(malformedStorage)).resolves.toEqual({
      status: 'anonymous',
      session: null,
      error: 'unknown',
    });
    expect(malformedStorage.saved).toBeNull();
  });

  it('persists fake login and register sessions without exposing password input', async () => {
    const storage = new MemorySecureSessionStorage();
    const transport = fakeTransport(validSession);
    const password = 'temporary-password';

    const loginState = await loginWithLocalSession(storage, transport, { available: true }, {
      identity: 'family-member',
      password,
      deviceId: 'device-local-1',
    });
    expect(loginState.status).toBe('authenticated');
    expect(JSON.stringify(storage.saved)).not.toContain(password);
    expect(JSON.stringify(buildAuthViewModel(loginState))).not.toContain(password);

    const registerState = await registerWithLocalSession(storage, transport, { available: true }, {
      inviteId: 'invite-local-1',
      displayName: 'Участник семьи',
      identity: 'family-member',
      password,
      deviceId: 'device-local-1',
    });
    expect(registerState.status).toBe('authenticated');
    expect(JSON.stringify(storage.saved)).not.toContain(password);
    expect(JSON.stringify(buildAuthViewModel(registerState))).not.toContain(password);
  });

  it('clears only secure session state on logout', async () => {
    const storage = new MemorySecureSessionStorage(validSession);
    const unrelatedLocalData = {
      chats: ['chat-local-1'],
      messages: ['message-local-1'],
    };

    await expect(logoutLocalSession(storage)).resolves.toEqual({
      status: 'anonymous',
      session: null,
      error: null,
    });
    expect(storage.saved).toBeNull();
    expect(unrelatedLocalData).toEqual({
      chats: ['chat-local-1'],
      messages: ['message-local-1'],
    });
  });

  it('clears local session on expired or replaced-device errors and blocks protected routes', async () => {
    for (const category of ['session_expired', 'device_replaced'] as const) {
      const storage = new MemorySecureSessionStorage(validSession);
      const state = await applyAuthFailure(storage, category);

      expect(storage.saved).toBeNull();
      expect(state).toEqual({ status: 'anonymous', session: null, error: category });
      expect(resolveAuthRoute(state, 'protected')).toEqual({ route: 'authEntry', redirected: true });
    }
  });

  it('resolves protected and auth-entry routes deterministically', () => {
    const anonymous = { status: 'anonymous' as const, session: null, error: null };
    const authenticated = { status: 'authenticated' as const, session: validSession, error: null };

    expect(resolveAuthRoute(anonymous, 'protected')).toEqual({ route: 'authEntry', redirected: true });
    expect(resolveAuthRoute(anonymous, 'authEntry')).toEqual({ route: 'authEntry', redirected: false });
    expect(resolveAuthRoute(authenticated, 'authEntry')).toEqual({ route: 'appEntry', redirected: true });
    expect(resolveAuthRoute(authenticated, 'protected')).toEqual({ route: 'protected', redirected: false });
  });

  it('returns Russian safe validation and view model messages', () => {
    const secret = 'raw-secret-token';
    const rawProblem = 'Error: failed at 127.0.0.1';

    expect(validateInviteInput('')).toEqual({ ok: false, message: 'Введите приглашение.' });
    expect(validateInviteInput('  opaque invite  ')).toEqual({ ok: true });
    expect(validateLoginInput({ identity: '', password: secret })).toEqual({ ok: false, message: 'Введите логин.' });
    expect(validateLoginInput({ identity: 'family-member', password: '' })).toEqual({
      ok: false,
      message: 'Введите пароль.',
    });
    expect(getAuthErrorMessage('invalid_credentials')).toBe('Логин или пароль не подошли.');

    const serialized = JSON.stringify([
      buildAuthViewModel({ status: 'anonymous', session: null, error: 'unknown' }),
      buildAuthViewModel({ status: 'authenticated', session: validSession, error: null }),
      getAuthErrorMessage('unknown'),
    ]);

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(rawProblem);
    expect(serialized).not.toMatch(/https?:|www\.|127\.0\.0\.1|0\.0\.0\.0|::1|Error:|stack/i);
  });

  it('keeps new auth source free of concrete network, timer, and production address code', () => {
    const authDir = 'src/auth';
    const files = fs.readdirSync(authDir).filter(file => file.endsWith('.ts'));
    const combined = files.map(file => fs.readFileSync(`${authDir}/${file}`, 'utf8')).join('\n');

    expect(combined).not.toMatch(/\b(fetch|WebSocket|XMLHttpRequest|EventSource|setTimeout|setInterval)\b/);
    expect(combined).not.toMatch(/\b(net|tls|dns|dgram|http|https):/i);
    expect(combined).not.toMatch(/https?:\/\//i);
    expect(combined).not.toMatch(/\b(socket|lookup|polling)\b/i);
  });
});
