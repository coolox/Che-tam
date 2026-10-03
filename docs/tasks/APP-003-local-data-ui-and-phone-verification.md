# APP-003 — local SQLite UI adapter and phone verification

- **Status:** approved
- **Branch:** `feat/app-phase-1-3`
- **Depends on:** APP-001 and APP-002, including `6b26236`.
- **Implementation agent:** Fatima; Hermes owns review, final verification, release APK, commit, and push.

## Goal

Replace the working Chats and Conversation source of truth with the local SQLite projection introduced in APP-002, while preserving the existing Russian visual language and core preview navigation. Add a local-only phone-verification flow. There must be no real authentication, server, HTTP, WebSocket, FCM, or production endpoint.

The existing `src/ui/demoData.ts` may remain only as a development fixture/seed input. It must not be imported directly by a working screen or be the runtime UI source of truth after bootstrap.

## Required behavior

### Local bootstrap and observable state

1. Add an explicit app-local database bootstrap/service under `src/storage/sqlite/**` (or a narrow `src/messages/**` adapter) that:
   - opens the database only through the injected/factory adapter;
   - runs `migrateDatabase` before reading/writing data;
   - exposes deterministic observable/snapshot state suitable for React (`loading`, `ready`, `error`);
   - reads Chats and Conversation strictly via APP-002 repositories;
   - has an injectable fake/in-memory factory for deterministic unit tests;
   - reports a Russian recoverable error state without exposing exception text.
2. On a fresh local install, seed a small, deterministic **development fixture** into SQLite only if there are no chats. The fixture may be derived from `demoData` but must be transformed and persisted through repositories before UI reads it. Reopening/reloading must not duplicate it.
3. Chats must be ordered by local `last_message_at`; unread must come from local `unread_count`; Conversation must render local SQLite messages. No direct screen import/read of `INITIAL_CHATS` or `INITIAL_MESSAGES`.
4. Opening a chat sets its local unread count to zero through the repository and refreshes observable state. Add the smallest repository operation needed and focused test coverage.
5. Explicit UI states in Russian:
   - loading: `Загружаем локальные сообщения…`;
   - empty chats: `Здесь появятся ваши чаты`;
   - empty conversation: `В этом чате пока нет сообщений`;
   - recoverable local read error: `Не удалось открыть локальные данные. Попробуйте ещё раз.` plus accessible retry action.
6. The existing composer must not send network traffic. It may stay disabled or show a clear local-only non-sending behavior, but it must not mutate only in-memory preview state as if it sent a real message. Do **not** implement real outbox send/network in this task.

### Phone verification (local-only)

1. Before normal app content, show a Russian local phone verification screen unless local verification state is already complete. It must include phone input, code input after request, validation/errors, submit/retry state, and an explicit explanation that this is a local setup step, not an SMS or server check.
2. Implement a pure local reducer/state-machine under `src/auth/**` or `src/phoneVerification/**` with explicit states. It must:
   - normalize/validate Russian-style entered phone numbers to a non-empty digit sequence with 10–15 digits;
   - reject an invalid phone with a Russian validation error;
   - allow code entry only after requesting a code;
   - accept only deterministic local test code `000000` (documented in UI as local test code), and reject other six-digit codes with a Russian error;
   - complete only after the expected local code;
   - never log or persist a phone number/code in SQLite or logs.
3. Persist only a non-sensitive boolean local `phone_verification_complete` in the app-local preference abstraction (not in the message SQLite schema) so completed verification survives restart. Use a narrow injectable storage interface with an in-memory fake in tests; production adapter may use existing AsyncStorage. Do not persist raw phone/code.
4. Verification screen and state must be accessible: labels, errors, retry/submit controls have Russian accessibility labels.

## Scope

Fatima may change/create only:

- `src/app/**`, `src/screens/**`, `src/components/**`, `src/hooks/**` for the working adapter and minimal UI wiring;
- `src/storage/sqlite/**` for repository/bootstrap operations needed above;
- `src/messages/**` for local projection adapters/selectors;
- `src/auth/**` or `src/phoneVerification/**` for local verification reducer/storage abstraction;
- `src/ui/state.ts` and `src/ui/types.ts` only as necessary to convert working screen data from the old preview shape to SQLite-driven view models;
- `src/ui/demoData.ts` only to export a fixture transformation input, not to make it a runtime source;
- `src/app/PreviewAppShell.tsx` only for minimal wiring of existing screens; do not broaden/mock-expand calls;
- `__tests__/*` focused on local bootstrap/selectors/repository and phone verification;
- this task file only for a factual completion note.

Never modify `canary-v4/**`, Android native files, `src/storage.ts`, `src/types.ts`, `src/config.ts`, native monitor/journal code, server/deploy configuration, secrets, `.env*`, package dependencies/lockfiles, calls/media, or any transport implementation.

## Required tests

Add or update focused tests proving:

1. clean local bootstrap migrates then seeds once; a repeated bootstrap does not duplicate chats/messages;
2. a repository-backed chat list is sorted by `last_message_at`, exposes stored unread, and uses no direct demo-data source;
3. local conversation loading returns stored chronological messages; opening a chat clears its persisted unread;
4. deterministic loading/empty/error/retry view-model states contain the required Russian text;
5. phone reducer rejects invalid phones, cannot submit code before request, rejects a wrong code, accepts `000000`, and does not retain raw phone/code in completed/persisted state;
6. persisted boolean verification completion restores the verified gate; no phone number/code is written by the preference adapter.

## Verification and delivery

Fatima runs: `npm run lint`, `npm test`, `npm run typecheck`, `git diff --check`; no Gradle/prebuild/APK/commit/push.

Hermes independently reviews and reruns all verification. Since this completes APP-001–003, Hermes then builds one release APK, validates it with `aapt dump badging`, runs APK integrity/signature checks and SHA-256, commits/pushes APP-003, and reports exact phone test steps.
