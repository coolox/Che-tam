# APP-010L — local invitation access gate

## Goal
Replace the local phone/SMS authorization UI entirely with an invitation gate, in accordance with `docs/architecture/ADR-003-access-by-invite.md`.

## Required UI and behavior
- Before the app shell, show Russian UI titled `Вход по приглашению`, fields labelled `Код приглашения` and `Как вас зовут`, and a submit button `Продолжить`.
- Remove phone number, SMS code input, SMS countdown/resend, phone validation and related visible text from the active app flow. Do not leave a route/toggle back to it.
- Local Foundation has no network/server check. In explicit `LOCAL_TEST_MODE`, accept a documented non-secret test invitation code. In normal local app mode, show a clear Russian explanation that an invitation code from Arslan is required; no SMS or network fallback.
- Persist successful local admission and display name through the existing safe local preference/storage pattern so reopening does not ask again. Do not log code/name.
- No real accounts, network, URLs or server calls. Future authoritative consumption/device binding lives in APP-008 after ADR-002.
- Tests cover reducer/validation and gate rendering, accepted localtest code, rejected/normal mode behavior, persistence boundary; production flow source must not expose phone/SMS UI.

## Scope
Allowed: replace old local phone verification files with focused invitation equivalents and update direct imports/tests. Avoid unrelated app UI changes. Do not modify ADR-002, SQLite schema/migrations, keyboard, localtest diagnostics/status, message actions, version/versionCode. Do not commit/push/build.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -20
```
