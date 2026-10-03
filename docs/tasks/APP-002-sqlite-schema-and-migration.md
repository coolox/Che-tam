# APP-002 — локальная SQLite-схема и миграция

- **Status:** approved
- **Branch:** `feat/app-phase-1-3`
- **Prerequisite:** APP-000 is accepted and pushed at `e8b5cf9`.
- **Implementation agent:** Фатима. Hermes owns dependency changes, builds, final verification, commits, and push.

## Goal

Introduce a versioned, local-only SQLite persistence layer for the future messenger. It must create and migrate a schema for profile, chats, messages, receipts, sync cursor, endpoint cache, and outbox without any HTTP, WebSocket, authentication, credentials, keys, server configuration, calls, or user-visible UI change.

The existing Canary journal (`src/storage.ts` and related Canary files) is out of scope and must not be repurposed or changed.

## Scope

### Hermes-owned prerequisite

Hermes adds the Expo-SDK-compatible `expo-sqlite` dependency and lockfile entry before the implementation handoff. No other dependency changes are allowed.

### Fatima may create/change

- `src/storage/sqlite/**` only — schema constants, migration runner, typed repository/transaction API, and testable in-memory/fake adapter contracts;
- `src/domain/types.ts` and `src/domain/selectors.ts` only where a new persistent domain type is required;
- `__tests__/sqlite*.test.ts` and/or `__tests__/repositories*.test.ts`;
- `docs/tasks/APP-002-sqlite-schema-and-migration.md` only for a concise factual completion note, if needed.

### Explicitly out of scope

- `App.tsx`, `src/app/**`, preview/screen/component UI, `src/ui/demoData.ts`, and all user-visible behavior;
- existing Canary monitor/journal code: `src/storage.ts`, `src/types.ts`, `src/config.ts`, `src/nativeMonitor.ts`, `src/schedulePolicy.ts`, `src/checks.ts`, exports, and their tests;
- `canary-v4/**`, Android native files, server/domain config, secrets, `.env*`, credentials, transport, FCM, WebSocket, HTTP, auth, calls, media;
- generated files, APK/build artifacts, Gradle/prebuild, lockfiles (except Hermes’s prerequisite lockfile update).

## Required schema (schema version 1)

All fields below are local SQLite fields. Store timestamps as ISO-8601 UTC text. Use explicit columns, parameterized statements, foreign keys, and transactions. Do not store message bodies in logs.

1. `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`.
2. `profiles(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, avatar_url TEXT NULL, updated_at TEXT NOT NULL)`.
3. `chats(id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, last_message_at TEXT NULL, unread_count INTEGER NOT NULL DEFAULT 0 CHECK(unread_count >= 0), updated_at TEXT NOT NULL)` plus index supporting chat-list ordering by `last_message_at`.
4. `messages(id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id), client_message_id TEXT NOT NULL UNIQUE, sender_id TEXT NOT NULL REFERENCES profiles(id), body TEXT NOT NULL, created_at TEXT NOT NULL, delivery_state TEXT NOT NULL, updated_at TEXT NOT NULL)` plus index for chronological messages per chat.
5. `message_receipts(message_id TEXT NOT NULL REFERENCES messages(id), profile_id TEXT NOT NULL REFERENCES profiles(id), state TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(message_id, profile_id, state))`.
6. `sync_cursors(scope TEXT PRIMARY KEY, cursor TEXT NOT NULL, updated_at TEXT NOT NULL)`.
7. `endpoint_cache(endpoint_id TEXT PRIMARY KEY, url TEXT NOT NULL, priority INTEGER NOT NULL, last_known_good_at TEXT NULL, updated_at TEXT NOT NULL)`.
8. `outbox(client_message_id TEXT PRIMARY KEY REFERENCES messages(client_message_id), chat_id TEXT NOT NULL REFERENCES chats(id), payload TEXT NOT NULL, state TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0), next_attempt_at TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`.

Required behavior:

- A clean database migrates to version 1 atomically and records exactly one migration row.
- Migration runner is idempotent: a second run does not recreate/erase schema or data.
- Repositories expose only the minimum operations needed by tests: upsert profile/chat/message, insert receipt, set/read cursor, upsert endpoint cache, enqueue/read outbox, and list chats/messages deterministically.
- Re-inserting the same `client_message_id` must not create a second message or outbox row. It must either be an explicit no-op or an upsert that preserves a single logical item; test this exact invariant.
- A migration from a fixture database marked version 0 with pre-existing version-0 user data must preserve that data while reaching version 1. The fixture may use only an intentionally minimal prior table required to demonstrate preservation; document its mapping in test names.
- All repository writes that affect message + outbox integrity must be transactional.
- No seeding from `demoData`; tests create their own data.

## Adapter design

- Production adapter wraps `expo-sqlite`, but does not open a database at module import. Database opening is explicit through a factory/injection point.
- Tests must use a deterministic in-memory fake adapter or a documented test SQLite adapter; no Android emulator/device/Gradle is required for tests.
- Keep SQL implementation inside `src/storage/sqlite/**`; do not spread raw SQL into domain/UI code.
- Define narrow TypeScript interfaces for database executor/transaction and repository dependencies to make migration and repositories unit-testable.

## Required tests

Add focused automated tests that prove:

1. clean install creates all eight tables, required indexes, and schema migration version 1;
2. rerunning migration preserves rows inserted after first migration;
3. repeated insert/enqueue using the same `client_message_id` yields exactly one message and exactly one outbox row;
4. version-0 fixture data is retained after migration to version 1;
5. chat listing has deterministic `last_message_at` ordering, and per-chat message listing has deterministic chronological ordering;
6. a failure during a combined message/outbox write rolls back both changes (using the fake adapter’s deterministic injected failure if real SQLite rollback cannot be tested directly).

## Verification

Fatima runs only:

```bash
npm run lint
npm test
npm run typecheck
git diff --check
```

Hermes independently reruns those commands and reviews the diff. **Do not build an APK in APP-002**: APP-001–003 share one APK after APP-003.

## Completion constraints

- Do not commit, push, run Gradle/prebuild/APK, access secrets, or make external calls.
- Stop and report if a required change falls outside this file.
- Report changed files, tests added, exact verification outcomes, and confirm zero network behavior was added.
