# APP-014L-06 — explicit local test-mode build

## Goal
A release build normally has no fake transport and no seeded demo chats. `EXPO_PUBLIC_LOCAL_TEST_MODE=1` deliberately enables both for a private local testing APK only. It must not add network behavior. Test-mode APKs are never for relatives.

## Requirements
1. Introduce one small, auditable test-mode configuration boundary that is true **only** when `EXPO_PUBLIC_LOCAL_TEST_MODE` is exactly `"1"`.
   - Default/release without that flag: demo seed disabled and `createDebugLocalAckTransport()` returns `null`, including when `__DEV__` is false.
   - Flag `1`: demo seed enabled and local fake ack transport enabled, including a release bundle where `__DEV__` is false.
   - Preserve ordinary development behavior only if it is already explicitly required; the acceptance behavior above takes precedence for no flag vs flag `1`.
   - Keep testability deterministic through a small exported pure resolver or dependency-injected config; do not mutate global process environment inside tests.
2. AppShell passes the resolved mode consistently to its local store. No endpoint, HTTP, WebSocket, key, secret, production transport, or external call.
3. In the Settings tab, when and only when local test mode is enabled, show exactly `Тестовая сборка` as accessible visible Russian text. Thread a boolean prop cleanly; do not show it in the normal release.
4. Add focused tests for both configurations, including actual local store bootstrap behavior: no-flag mode has empty ready SQLite snapshot and null transport; flag mode seeds chats and fake transport acknowledges. Include the Settings conditional label in UI/source-level tests compatible with this repo.

## Scope
Expected files: a small local configuration module, `src/messages/localOutbox.ts`, `src/messages/localMessageStore.ts`, `src/app/AppShell.tsx`, `src/app/PreviewAppShell.tsx`, focused tests and this task file. Avoid unrelated Preview refactoring.

Do not modify Android version/versionCode, ADR-002, APP-013L correction notes, SQLite schema/repositories, commit, push, or build APK.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -15
```
