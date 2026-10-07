# RELEASE-068 — v0.6.8 localtest metadata

- **Status:** approved by Arslan, 2026-10-07. Release metadata after CRYPTO-001.
- **Scope:** change only version metadata needed for `che-tam-v0.6.8-localtest-arm64.apk`.

## Required

- Set `package.json` and `package-lock.json` version to `0.6.8`.
- Set Expo app version to `0.6.8` and Android `versionCode` to `9` (previous release: 0.6.7 / 8).
- Do not change code, dependencies, crypto implementation, docs other than this task, network/server settings, or build scripts.
- Do not build APK, Gradle/prebuild, commit or push.

## Check

Run version-config focused test if available, lint/typecheck/diff check. Report exact rollout JSONL.