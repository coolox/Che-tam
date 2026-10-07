# APP-014L-19 — 0.6.7 localtest version preparation

- **Статус:** approved by Arslan, 2026-10-07. Local tasks APP-014L-14..18 complete; APK build is Hermes-owned after this task.
- **Boundary:** change only release version metadata/docs/tests required for localtest `0.6.7`; no Gradle/APK/prebuild, no server/network/ADR-002/bots/secrets/infrastructure, no commit/push.

## Requirements

1. Change app versionName to `0.6.7` and Android versionCode to `8`, preserving package identity `net.hearth.chetam` so an install overlays v0.6.6.
2. Update only release test/task metadata necessary to assert v0.6.7/versionCode 8. Do not alter build script semantics or current protected coordinator docs.
3. Verify version source and existing build script test; all non-native checks pass.
4. APK is explicitly out of scope: Hermes will invoke `scripts/build-localtest-apk.sh` with `EXPO_PUBLIC_LOCAL_TEST_MODE=1`, then inspect embedded config, sha256, aapt badging.

## Allowed

Minimal app config/version files, version-related test(s), this task file. Do not change `docs/architecture/ADR-002-server-and-domains.md`, APP-PLAN, previous task docs, scripts unless a test exposes a genuinely version-specific assertion and task must stop/report before modifying scripts.

## Checks

Targeted tests + lint/full Jest/typecheck/diff check. Report exact rollout JSONL. No build/commit/push.