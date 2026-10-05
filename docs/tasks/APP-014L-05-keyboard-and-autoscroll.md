# APP-014L-05 — keyboard-safe conversation and intentional autoscroll

## Goal
Fix the Android phone bug where the keyboard hides the newest outgoing message. This is a UI-only local task; no production transport, endpoint, network call, secret, call functionality, or data-model migration.

## Requirements
1. The composer and most recent messages remain visibly above the Android keyboard.
   - Set Expo Android `softwareKeyboardLayoutMode` to the correct resize mode in `app.json`.
   - Keep `KeyboardAvoidingView` / list layout compatible with that Android setting; do not introduce absolute positioning that can hide the composer.
2. On entering the conversation, after the user successfully sends their own message, and when the keyboard opens while the user is at the bottom, scroll the inverted `FlatList` to the newest message.
3. Preserve reading position: when the user has deliberately scrolled upward in history, an incoming/snapshot update must **not** yank the list down. An outgoing message intentionally returns the view to the bottom.
4. Make scrolling deterministic and testable through small exported pure helpers/state if needed; no timer-only correctness.
5. Retain existing error/empty state, message ordering, accessibility, retry and status behavior.

## Tests
Add focused tests that prove:
- Android config selects `softwareKeyboardLayoutMode: "resize"`;
- outgoing/send and keyboard-open at bottom request scroll-to-latest;
- an incoming update while manually scrolled away does not request it;
- outgoing request overrides manual-scroll hold.

## Scope
- Expected code: `app.json`, `src/app/screens/ConversationScreen.tsx`, focused UI tests and, only if needed, a small local UI helper.
- Do not modify `docs/architecture/ADR-002-server-and-domains.md`, existing APP-013L correction notes, app version/versionCode, transport/store/SQLite behavior, commit, push, or build APK.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -15
```
