# APP-003b — phone bugs: local setup, SQLite seed, preview actions

- **Status:** approved
- **Depends on:** APP-003a, APP-004, APP-005, APP-006
- **Implementation agent:** Fatima through Codex CLI only. Hermes owns review, verification, APK, commit, and push.

## Scope

Fix exactly the Android-phone bugs reported against APK 0.6.0. Keep the application local-only: no production server, endpoint, HTTP/fetch/WebSocket/socket/DNS, FCM, timer/polling, credentials, secrets, or real call/media implementation.

## B1 — local phone setup screen

`src/app/AppShell.tsx` currently owns the local phone setup/verification entry. Make it visually consistent with `WelcomeScreen` in `src/app/PreviewAppShell.tsx`:

- use the existing theme and safe-area layout; no content under Android status bar;
- a visibly outlined phone input with placeholder `+993 …`, accessible label, and `phone-pad` keyboard;
- a visibly outlined verification-code input, 6-digit maximum, accessible label, and `number-pad` keyboard;
- primary button uses existing primary-button visual language and is disabled for an invalid phone input;
- show local validation/error below the relevant field;
- show `Попробовать ещё раз` only for an actual submit/verification failure state, not merely input validation;
- retain the current strictly local fake flow; do not add a real auth adapter or network call.

Focused component/reducer tests must cover visible input props/state behavior, disabled button for invalid number, code constraints, error placement/state, and retry visibility only after a real local failure.

## B2 — phone SQLite failure

The phone fails with `Не удалось открыть локальные данные`. Find and fix the real root cause in the app local SQLite boot/migration/seed path. The likely foreign-key ordering needs investigation, not assumption.

- Add a Jest test that executes the actual SQLite schema/migrations/seed sequence with `PRAGMA foreign_keys = ON` using a genuine SQLite engine (for example `better-sqlite3`), not `InMemorySqliteDatabase`.
- It must prove first open/migration/seed succeeds and persisted chats/messages are readable; also prove FK enforcement rejects a message whose chat is absent.
- If a package is needed for this exact test, add only the smallest test-only dependency and lockfile update. Do not add production dependencies.
- Fix the production local bootstrap/seed/migration/repository code only as supported by that failing real-SQLite test.
- Preserve data on retry/restart; do not disable foreign keys.
- Make `LocalDataSnapshot.errorText` include the existing short Russian message followed by a safe short error code derived from `Error.name`/message (bounded, no stack, no SQL parameters, no message bodies, no password/token/URL/address). It must be visible in both Chats and Conversation error panels so the user can screenshot it.

## B3 — profile avatar

In Preview Settings profile card, ensure the avatar is visibly rendered and not an empty left gap, using the existing `SELF_AVATAR` / existing avatar style system. Add a focused preview/UI test.

## B4 — calls and video actions

Buttons in Family and Calls must open the existing `CallScreen` mock for the selected chat and requested audio/video mode. If an action has no resolvable chat, show a short visible Russian fallback `Звонки появятся позже` rather than silently doing nothing. No real call/media/network code.

Add focused tests for Family audio/video and Calls callback actions; test the fallback for unresolved targets.

## B5 — list spacing

Ensure a consistent **8 dp** vertical gap between the top header and first content row on all four tabs: Chats, Calls, Family, Settings. Do not alter the bottom-tab/safe-area geometry. Add focused testable style/structure coverage.

## Allowed files

- `src/app/AppShell.tsx`
- `src/app/PreviewAppShell.tsx`
- `src/messages/localMessageStore.ts`
- narrowly necessary `src/storage/sqlite/**`
- focused tests under `__tests__/`
- `package.json` and lockfile only if a genuine SQLite Jest dependency is strictly required

Do not alter unrelated modules, Canary, Android/iOS configs, assets, auth/transport contracts, docs other than this task, or existing task files.

## Required verification

```bash
npm run lint
npm test
npm run typecheck
git diff --check
```

Report exact changed files, real SQLite test result, root cause, and confirmation that no network-capable code, real endpoint, credentials, or production call stack was added. Do not commit or push.