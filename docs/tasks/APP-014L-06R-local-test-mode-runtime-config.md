# APP-014L-06R — fix local test-mode build-time configuration

## Problem found during the requested `EXPO_PUBLIC_LOCAL_TEST_MODE=1` release build
The mode resolver reads `process.env` dynamically. Expo’s production public-env substitution only guarantees direct compile-time access and the produced bundle did not provide reliable evidence that the flag was embedded. Fix the configuration boundary so the build flag is explicitly carried into the Expo runtime config.

## Requirements
1. In `app.config.js`, derive a boolean/string runtime extra from `process.env.EXPO_PUBLIC_LOCAL_TEST_MODE === '1'`. Preserve existing config extras and do not add endpoints/secrets.
2. Make `getLocalTestModeConfig()` read this value from `expo-constants` runtime configuration (with a safe false default), rather than relying on dynamic `process.env` access in bundled code.
3. Preserve `resolveLocalTestMode(env)` as a pure injection-friendly resolver; adapt types/tests accordingly. Exact semantics: only flag `1` enables mode; no flag or any other value is false.
4. Tests must demonstrate configuration extraction from an injected/config-shaped value without mutating global environment. Existing no-flag/flag SQLite and fake-transport tests remain green.
5. Do not alter test-mode behavior, UI label, drafts/schema, app version/versionCode, ADR-002, correction notes, commit, push or APK build.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -15
```
