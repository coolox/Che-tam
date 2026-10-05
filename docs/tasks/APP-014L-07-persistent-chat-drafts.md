# APP-014L-07 — persistent per-chat composer drafts (local, before ADR-002)

## Goal
Persist an unfinished composer draft per chat in local SQLite. It survives navigating away and app/store restart, and is cleared only after a successful text-message enqueue/send. No production transport or server behavior.

## Requirements
1. Add a SQLite migration and repository API for drafts keyed by `chat_id`, storing text and update timestamp. A draft must be read when opening a chat and updated when the user edits the composer.
2. Wire the actual Conversation composer state in `PreviewAppShell` to this store API. Protect against stale async loads: switching chats quickly must not replace the currently selected chat's input with another chat's draft.
3. Persist non-empty input per chat; blank input removes/clears its draft. When `onSendMessage` reports `{ sent: true }`, clear the persisted draft and composer only for that chat. If sending is rejected/fails, retain it.
4. Drafts persist across `createLocalMessageStore` restart using the same actual SQLite database. This task must use real SQLite tests for persistence behavior wherever repository/database integration exists; fake/in-memory may supplement isolated wiring but is insufficient alone.
5. Add Russian accessibility labels/text only where new visible UI is needed (no new UI is required if draft is ordinary composer content). Do not log message draft text.

## Scope
Expected code: SQLite migration/repositories/in-memory adapter, local message store interface, actual shell composer wiring, focused tests and this task file. Do not add server/network calls or modify ADR-002, app versions, test-mode semantics, old APP-013L corrections. No commit/push/build.

## Required tests
- Store/repository saves/loads separate drafts by chat, clears blank draft, and clearing after a successful send only.
- Real SQLite: a draft survives reopening the same database/store.
- UI/wiring logic: navigating chat A → B → A restores A; stale A load cannot overwrite B.
- Failed/empty send retains draft, successful send clears it.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -15
```
