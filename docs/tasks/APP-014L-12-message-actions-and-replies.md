# APP-014L-12 — message long-press actions and reply context

## Goal
Add local message actions to the conversation UI: long-press action sheet, reply context, copy and delete-for-me. Persist reply linkage through SQLite schema v3 and protect upgrades from v1/v2 with real SQLite regression coverage.

## Required behavior
### Long press
- Long-press a text message opens an accessible Russian local action menu/sheet with `Ответить`, `Копировать`, and `Удалить у себя`; cancellation dismisses it. No server/network action.
- Copy uses React Native Clipboard API already available in project or a small injected abstraction; copy exact text, with tests/mocks. Do not log text.
- `Удалить у себя` removes the selected message only from local SQLite/UI. It must be explicit (confirmation if project conventions require) and not create outbox/network work.

### Reply
- `Ответить` sets a reply target above composer, showing sender/name and a bounded preview. It has an accessible dismiss affordance.
- Sending persists reply-to message ID and snapshot fields sufficient to render quote later. Message bubble renders a quote preview above body; quote must survive app restart/reload and handle original deleted locally (stored snapshot still renders).

### SQLite schema v3
- Add contiguous migration v3. Add reply columns to `messages`: `reply_to_message_id` nullable FK with `ON DELETE SET NULL`, `reply_sender_name` nullable, `reply_preview` nullable, plus an index as appropriate.
- Update types/repositories/local store mapping and write path. Existing v1/v2 databases upgrade transactionally and retain data.
- Extend `sqliteLegacyUpgrade.test.ts` / real node:sqlite coverage so versions 0/v1/v2 all migrate to v3, including existing 9596486 chain; assert migration table versions and reply columns. Do not rely solely on in-memory adapter.

### Tests
Cover reducer/state transitions, long-press UI/action wiring, copy abstraction, local delete, reply persistence/render/reload, and schema upgrade. Full suite must pass.

## Constraints
No message protocol/server/network work, no version bump/build, no changes to ADR-002/ADR-003, invite flow, keyboard behavior, or localtest diagnostic semantics. Do not touch existing unrelated dirty task notes. Do not commit/push/build.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -20
```
