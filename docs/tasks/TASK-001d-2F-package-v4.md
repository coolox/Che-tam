# TASK-001d-2F — Unique Android package for Canary v4.0.2

## Status
Approved for implementation by Arslan, 2026-09-29.

## Goal
Allow Canary v4 to install alongside the legacy Canary package that has a different signing key.

## Scope — only these files if needed
- `canary-v4/android/app/build.gradle.kts`
- `canary-v4/android/app/src/main/AndroidManifest.xml` (only if required to correct provider authorities)
- `canary-v4/android/app/src/main/java/net/hearth/canary/MainActivity.kt` (only if authority construction must be corrected)
- `canary-v4/android/app/src/main/res/values/strings.xml`

Do not rename `namespace`, Kotlin packages, directories, imports, or action-string package names. Do not touch secrets, signing files, generated files, dependencies, or unrelated sources.

## Required changes
1. In `defaultConfig`, set `applicationId = "net.hearth.canary.v4"`.
2. Preserve namespace as `net.hearth.canary` and all Kotlin packages as-is.
3. Set `versionCode = 40002` and `versionName = "4.0.2"`.
4. The visible app label must be exactly `Hearth Canary v4`.
5. Ensure every Android provider authority is derived from `${applicationId}` in the manifest. No hard-coded `net.hearth.canary...` authority may remain.
6. Where Kotlin code supplies an authority string to `FileProvider` (or another provider), construct it from `BuildConfig.APPLICATION_ID`, e.g. `"${BuildConfig.APPLICATION_ID}.fileprovider"`; do not use a literal package ID or `packageName` for this authority.

## Safety
- Before each edit, make dated backups in `/root/backups/codex/`; never create backup files inside the repo.
- Never read, print, create, modify, stage, or commit `secrets.properties`, `.env*`, signing credentials, keystores, or generated artifacts.
- Do not run Gradle/build/prebuild/native compilation. Hermes will test and build.
- Do not commit or push.

## Acceptance checks (inspection only)
- `build.gradle.kts` has the exact new application ID and version values.
- Kotlin namespace/packages remain `net.hearth.canary`.
- No literal `net.hearth.canary...` is used as a provider authority.
- MainActivity provider authority uses `BuildConfig.APPLICATION_ID`.
- App label resolves exactly to `Hearth Canary v4`.
