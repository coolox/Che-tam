# APP-003c — release version 0.6.2

- **Status:** approved by Arslan, 2026-10-05
- **Scope:** Android release version metadata only for the APP-003b release.
- **Implementation agent:** Fatima through Codex CLI only.

## Required change

The already verified APP-003b source is to be delivered as release **0.6.2**.

The prebuilt Android project contains native metadata that overrides Expo `app.json`; therefore update only these version fields and keep them aligned:

1. `app.json`:
   - Expo `version`: `0.6.2`;
   - Android `versionCode`: `3`.
2. `android/app/build.gradle`, only the `defaultConfig` version fields:
   - `versionName "0.6.2"`;
   - `versionCode 3`.

Do not modify application functionality, any other native configuration, dependencies, assets, permissions, Canary code, network configuration, or task files.

Do not build, prebuild, run Gradle, commit, or push.

## Verification

```bash
npm run typecheck && git diff --check
```

Report the exact metadata values and verification result.
