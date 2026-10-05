# APP-014L-08 — local date separators in conversations (before ADR-002)

## Goal
Render date separators within a conversation: `Сегодня`, `Вчера`, otherwise a Russian calendar date. Classification must use the device’s local civil time, not UTC. This is UI/presentation only; no server/network behavior.

## Requirements
1. Add a pure, exported date-separator grouping/presentation helper with injected `now` and `timeZone` options so tests are deterministic. It receives chronological messages and produces/render-ready items that preserve original message order and add a divider before the first message for each local calendar date.
2. Labels:
   - same local day as `now`: exactly `Сегодня`;
   - immediately preceding local calendar day: exactly `Вчера`;
   - older: locale Russian calendar date (e.g. `3 октября`), no weekday and no implicit UTC conversion. Year must be included when date is outside `now`’s calendar year (e.g. `3 октября 2025 г.` or platform-consistent Russian `year` output).
3. Wire `ConversationScreen` FlatList to display dividers correctly with its inverted rendering. Do not use a static always-`Сегодня` footer once messages exist. Divider accessibility must expose its label.
4. Preserve all current keyboard/autoscroll, retry/status, empty/loading/error and message-bubble behavior. No changes to storage schema, drafts, transport, endpoint/config, app version/versionCode, ADR-002 or APP-013L correction notes.
5. Add focused tests including a real local-time boundary where a UTC date is different from the device time-zone date, Today/Yesterday/older labels, ordering/group boundaries, and render integration/source-compatible assertion as appropriate.

## Scope
Expected files: `src/ui/state.ts` or a narrow UI helper, `ConversationScreen.tsx`, focused tests and this task file. Do not commit/push/build.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -15
```
