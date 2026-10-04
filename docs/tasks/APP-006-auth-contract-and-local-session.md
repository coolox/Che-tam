# APP-006 — auth contract and secure local session

- **Status:** approved
- **Depends on:** APP-005 (`f40d4ad`)
- **Implementation agent:** Fatima via Codex CLI only. Hermes owns review, verification, commit, push, and APK.

## Goal

Create a strictly local, network-free authentication foundation: typed invite/register/login/session/device-binding contracts, a single narrow secure-session storage abstraction, deterministic local session state, validation/error mapping in Russian, and protected-navigation policy. The feature uses fakes only. It must not call a real server, store passwords in SQLite/logs, or add an authentication UI screen in this task.

## Requirements

### 1. One auth contract and fake-only boundary

Create `src/auth/**` with a narrow typed contract for future invite redemption, registration, login, session restoration, logout, and device binding. It exposes request/response/error types and an `AuthTransport` interface only.

- Do not implement HTTP, fetch, WebSocket, sockets, DNS, endpoint URL/address, SDK client, server adapter, or any concrete networking.
- The contract must carry opaque IDs only: invite ID, account/profile ID, session ID, device ID. No production endpoint/domain/secret.
- Password input may exist transiently in a typed login/register request, but must not be persisted, returned in a session, written to logs, or included in error/view-model output.
- Auth error categories must be deterministic and user-safe: `offline`, `invalid_invite`, `invalid_credentials`, `session_expired`, `device_replaced`, `unknown`.

### 2. A single secure-session interface

Create exactly one session persistence abstraction under `src/auth/**` or `src/storage/session*`:

```ts
type SecureSessionStorage = {
  load(): Promise<AuthSession | null>;
  save(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
};
```

- It stores only `AuthSession`, never raw password, invite input, raw server exception, or general app data.
- A fake in-memory storage is allowed only in tests.
- Do not change existing Canary storage or `src/storage.ts`.
- No platform-specific secure-storage implementation is required in APP-006; the abstraction is intentionally injectable.

### 3. Local session reducer/service

Implement deterministic, testable local auth/session state and service functions.

- Restore an existing session through the storage abstraction.
- Successful fake register/login stores and exposes a validated session.
- Logout calls `clear()` and removes only session-only state. It must not delete chats, messages, or arbitrary local app data.
- `session_expired` and `device_replaced` clear the secure session and result in no authenticated session.
- Reject malformed session data rather than treating it as authenticated.
- Keep all output free of password/token/error-exception disclosure.

### 4. Protected navigation policy

Add a pure navigation policy, not a screen implementation.

- Without a valid authenticated session, protected app routes resolve to a named auth entry route.
- With a valid session, an auth entry route resolves to the protected app entry route.
- The policy is pure and deterministic; it must not navigate imperatively or mount UI.

### 5. Russian validation and safe view-model

Provide pure Russian validation/error and auth-state view-model functions.

- Invite input is non-empty opaque text; do not impose a production code format.
- Login identity and password must be non-empty for local validation; password must never be echoed.
- The view-model may show stable account/profile/device opaque IDs only where needed for diagnostics, state category, and a Russian safe message.
- It never includes password, session token/secret, raw exception, endpoint, URL, or address.

## Focused tests

Add deterministic tests proving all of the following:

1. the auth transport is an interface/contract and no fake attempt is invoked while policy says offline;
2. only one secure-session interface exists; save/load/restore uses a valid fake session and rejects malformed persisted data;
3. fake login/register success persists a session, while password input is absent from saved state and public view models;
4. logout clears only secure session state; unrelated fake chat/message data remains untouched;
5. `session_expired` and `device_replaced` clear the local session and block protected routes;
6. protected-route/auth-entry policy has deterministic results for session/no-session;
7. Russian validation/error messages are safe and no raw token/password/exception/address/URL is disclosed;
8. no concrete HTTP/fetch/WS/socket/DNS lookup/timer/polling/network module or production endpoint/address exists under new `src/auth/**` files.

## Constraints

- Only new `src/auth/**`, a narrowly scoped focused test file, and this task file may change.
- No actual HTTP/fetch/WebSocket/socket/DNS lookup, endpoint URL/address, server, Supabase, FCM, foreground/background service, polling, retry timer, secrets, `.env`, package/lockfile, Android/iOS, Canary, calls/media, APK/Gradle/build, commit, or push by Fatima.
- Do not alter `App.tsx`, existing APP-004 UI/hook, `src/transport/**`, existing `src/storage/**`, or existing test files.
- Do not add an auth screen/UI in APP-006. APP-009 will add real login/register/session UI after the ADR-002 gate and server work.

## Verification

Fatima runs:

```bash
npm run lint
npm test
npm run typecheck
git diff --check
```

Report files, exact outcomes, and explicit confirmation that no network-capable code or credentials were added. Do not commit or push.