# APP-014L-11 — Android keyboard avoidance in conversation

## Phone regression
`ConversationScreen.tsx` uses `KeyboardAvoidingView` from `react-native-keyboard-controller`, but currently passes `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. On Android this leaves the composer and latest conversation content behind the keyboard. The existing test replaced the component with a stub and asserted scroll logic only, so commit `e5055f0` passed without asserting Android props.

## Goal
On Android the composer is always above the on-screen keyboard, while iOS behavior remains correct. Use the currently installed `react-native-keyboard-controller` `KeyboardAvoidingView` semantics; do not introduce a new dependency unless unavoidable.

## Requirements
1. Set an explicit Android keyboard avoidance behavior supported by the actual installed component (`padding`, or replace with its documented `KeyboardStickyView` only if needed), retaining appropriate iOS behavior and `automaticOffset`/safe-area handling.
2. Keep the newest messages/composer visible when keyboard opens. Do not break inverted list scroll intent, date dividers, drafts or message sending.
3. Replace/adjust the old test approach so it does **not mock `KeyboardAvoidingView`**. Add an Android-focused assertion against the real component props/render tree (or a narrow pure exported config consumed by the real component) proving Android gets `behavior="padding"`; test iOS too if config is extracted.
4. Explain in the task record why `e5055f0` passed: it stubbed the keyboard-avoidance component and exercised scrolling, not Android avoidance props.

## Constraints
Do not change ADR-002, app version/versionCode, auth/invite, SQLite schema/migrations/drafts, localtest diagnostics/status semantics, message actions or unrelated task notes. Do not commit/push/build.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -20
```

## Task record
`e5055f0` passed because the conversation keyboard test stubbed
`react-native-keyboard-controller`'s `KeyboardAvoidingView` and only
exercised the scroll-intent reducer. That coverage did not inspect the
props consumed by the real conversation component, so Android still
received no avoidance `behavior`.
