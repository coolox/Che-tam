# APP-003a — device-local time and SQLite foreign-key enforcement

- **Status:** approved
- **Depends on:** APP-003 (`0f6e000`)
- **Implementation agent:** Fatima; Hermes owns review, verification, commit, and push.

## Goal

Fix two local-data correctness issues without changing UI scope, network behavior, dependencies, Android/native configuration, or producing an APK.

## Requirements

1. **Chat-list time uses the device time zone.**
   - In `src/messages/localMessageStore.ts`, remove the explicit `timeZone: 'UTC'` used to build the chat-list time display.
   - Extract/use a small pure formatting helper that accepts optional `Intl.DateTimeFormatOptions` for deterministic tests but uses the device default time zone in production.
   - Add focused tests for the same ISO timestamp formatted with explicit `Europe/Istanbul` and `Asia/Ashgabat`, proving the respective localized output is used and differs for an instant where those zones differ.

2. **SQLite foreign keys are enabled on every open, before migrations.**
   - `createExpoSqliteDatabaseFactory` must run `PRAGMA foreign_keys = ON` immediately after `openDatabaseAsync`, before handing out the `SqlDatabase` and before `migrateDatabase` can run.
   - `InMemorySqliteDatabase` must model the same behavior: default foreign-key enforcement is disabled until the pragma is executed; recognise the pragma; when enabled, reject inserting a `messages` row whose `chat_id` does not exist in `chats`, as SQLite does.
   - Add deterministic tests for the actual factory/open path (mock Expo SQLite as needed) proving pragma precedes migration/application usage, and for repository insertion proving a message with an unknown `chat_id` rejects after foreign keys have been enabled. Keep existing migration/repository tests.

## Constraints

- No HTTP, WebSocket, FCM, server, endpoint, authentication-server, calls, media, secret, `.env`, package/lockfile, native Android/iOS, Canary, build, Gradle, APK, commit, or push action by Fatima.
- Scope is limited to `src/messages/localMessageStore.ts`, `src/storage/sqlite/expoAdapter.ts`, `src/storage/sqlite/inMemoryAdapter.ts`, focused SQLite tests, and this task factual note. Add a narrowly focused helper/test only if necessary.
- Preserve existing SQLite idempotency and transaction behavior.

## Verification

Fatima runs exactly:

```bash
npm run lint
npm test
npm run typecheck
git diff --check
```

Report changed files, exact results, and explicitly confirm no network traffic or APK build.