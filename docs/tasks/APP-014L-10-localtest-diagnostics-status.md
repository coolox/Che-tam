# APP-014L-10 — localtest diagnostic error details and connected transport status

## Goal
Improve only the local-test diagnostic surface:
1. under a local-data bootstrap error code, display the full safe error name/message **only in local test mode**;
2. in local test mode, the fake local ack transport is a connected transport and chat header status displays `На связи` instead of `Восстанавливаем связь`.

## Requirements
### Localtest error detail
- Preserve production text exactly: production shows only `Не удалось открыть локальные данные. Код: <safe-name>-<hash>`; do not show raw database error messages outside explicit local test mode.
- Introduce a structured/callable error presentation boundary if needed. The raw diagnostic is rendered only when `localTestMode.enabled === true`, directly below the error code, with a Russian accessible label. Include error name and message, sanitised to a bounded UI-safe string; never log it.
- Tests assert enabled and disabled rendering/presentation, proving production does not contain raw message.

### Localtest connection status
- Derive the localtest connection state from the actual existing fake local ack transport / explicit local-test configuration; no fake remote network, endpoint or real adapter.
- In local test mode with fake transport enabled, `useConnectionStatus` / ConversationScreen receives and renders `На связи` (with corresponding connected tone/accessibility semantics) rather than `Восстанавливаем связь`.
- No-flag production/local mode behavior remains unchanged; tests cover both.

## Constraints
Local-only before ADR-002. Do not modify auth/invitation, keyboard, SQLite schema/migrations/drafts, message actions, app version/versionCode, ADR-002 or unrelated correction notes. Do not commit/push/build.

## Verification
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -20
```
