# RELEASE-068R — обновить ожидание теста release metadata

- **Статус:** approved by Arslan, 2026-10-07. Follow-up to APP-RELEASE-068.
- **Scope:** test expectation only; version metadata is already `0.6.8`, Android versionCode `9`.

## Required

Update the existing focused app-config test so it expects `0.6.8` and `9`, then run it. Do not change production code, package/app metadata, dependencies, crypto, docs other than this task, server/network, build scripts. No Gradle/APK/prebuild, commit or push.

## Verification

Focused app config test, lint, typecheck, diff check. Report exact rollout JSONL.