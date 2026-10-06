# APP-014L-13 — corrected localtest invite and v0.6.6 release metadata

## Context
The prior v0.6.5 localtest APK was assembled with `EXPO_PUBLIC_LOCAL_TEST_MODE=true`, but app config serialized only value `1`, disabling localtest at runtime. Correct the feature and prepare the replacement upgrade APK metadata.

## Required changes
### 1. Localtest invitation
- Replace `LOCAL-TEST-INVITE` entirely with visible/documented test code `ТЕСТ`.
- Only when localtest is enabled, accept invite input after Unicode trim and case-insensitive comparison for both Russian `ТЕСТ` and Latin `TEST`. Examples that must pass: `ТЕСТ`, `тест`, `  ТЕСТ  `, `TEST`, `test`, ` Test `.
- On localtest login screen show exactly: `Тестовый код: ТЕСТ`.
- In release without the flag preserve existing behavior: no hint and no local invitation is accepted; retain the existing server-not-available error.
- Update focused invitation tests and ADR-003 to state the code/normalization/localtest-only boundary. No phone/SMS flow or unrelated auth changes.

### 2. Localtest flag interpretation
- In `app.config.js`, serialize `extra.EXPO_PUBLIC_LOCAL_TEST_MODE` as string `"1"` when the environment value is `1` or `true`, case-insensitive (whitespace around the environment value may be treated as insignificant). Serialize `"0"` otherwise.
- In `resolveLocalTestMode`, enable for the same `1` / `true` case-insensitive inputs and disable all others. Add unit coverage for both accepted spellings/cases and rejected values; preserve the runtime config boundary.
- Add an app-config-level test if project conventions allow invoking it without mutation; otherwise keep the implementation small and test the pure resolver comprehensively.

### 3. Release metadata and reproducible localtest build verification
- Update Expo/native/package metadata from the currently uncommitted `0.6.5` / code 6 release preparation to `0.6.6` / Android `versionCode 7` consistently in `app.json`, `android/app/build.gradle`, `package.json`, and `package-lock.json`.
- Add a project-owned executable script (for example `scripts/build-localtest-apk.sh`) that builds ARM64 release with canonical `EXPO_PUBLIC_LOCAL_TEST_MODE=1`, copies/uses the final APK argument or canonical output, then runs exactly `unzip -p "$APK" assets/app.config | grep -F '"EXPO_PUBLIC_LOCAL_TEST_MODE":"1"'`. It must exit non-zero if the flag check fails. It must not print or rely on unrelated bundle strings. The optional APK argument must work whether relative or absolute: normalize it to an absolute path before the script changes directory into `android`. Add a focused test or shell-level testable structure where practical; at minimum verify the script is executable and its static command contains the required fail-closed pipeline.
- Do not build, commit, push, add dependencies, change migrations, touch ADR-002, or modify other untracked task notes.

## Verification
Run the relevant focused tests, then:
```bash
npm run lint && npm test && npm run typecheck && git diff --check
```

## Expected changed paths
`app.config.js`, `src/messages/localTestMode.ts`, invitation-gate reducer/UI tests as needed, `docs/architecture/ADR-003-access-by-invite.md`, `__tests__/localTestMode.test.ts`, `app.json`, `android/app/build.gradle`, `package.json`, `package-lock.json`.
