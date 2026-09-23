# Task: UI Preview release and visual handoff

- **ID:** `UI-007`
- **Status:** `planned`
- **Goal:** Finish visual consistency and verify all UI Preview interactions. Producing the signed ARM64 Android release APK is a separate Hermes-run step, not part of Fatima's task.
- **Fatima's scope:** Visual/consistency polish across screens, a fresh original launcher icon asset, short Turkish-field-test installation note in Russian, lint/test/typecheck green. No Canary/server integration. **Fatima must not run `expo prebuild`, `gradlew`, any Android build/compile command, or open a device/emulator.**
- **Hermes's scope (after Fatima's code is accepted):** Run the Android release build directly, sign the APK, review bundle/config/signature/archive, install on device or emulator for interaction review, compute SHA-256, and produce the handoff (filename, size, SHA-256, test checklist).
- **Acceptance:** lint/test/typecheck pass (Fatima). Android release build succeeds, has no backend configuration and no sensitive permissions, and handoff is produced (Hermes).
