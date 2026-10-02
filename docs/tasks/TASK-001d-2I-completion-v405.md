# TASK-001d-2I-completion — remaining light-run fixes for v4.0.5

## Status
Approved by Arslan under the canonical plan `docs/tasks/TASK-001d-plan-405-410.md`. This is a separate implementation pass for **only** the remaining requirements of plan item 2. Existing committed 2K WIP must remain untouched; do not implement full-run/TURN/upload/budget/nightly-upload features in this pass.

## Required reading
Read `AGENTS.md`, the canonical plan, the prior `TASK-001d-2I-light-run-calibration-v405.md`, and relevant existing Android code/tests before editing.

## Scope and required behavior
Complete only the still-unmet subitems of plan item 2:

1. **2.5 Wi-Fi RSSI:** Ensure `wifiRssi` is collected reliably from the active Wi-Fi `NetworkCapabilities.transportInfo` when available. Diagnose the existing failure mode where it becomes empty after idle: tolerate unavailable/permission-redacted transport info without stale/deprecated API use; record an explicit nullable value only when genuinely unavailable. Add pure helper/JVM test coverage for transport-info extraction/fallback logic as feasible.
2. **2.6 Timestamp validation:** Ensure journal persistence rejects any record whose `timestampUtc` is null, missing, non-positive, or invalid before DAO insertion. Add focused unit tests for rejected invalid payloads and accepted valid payload.
3. **2.7 `cycle_start` context:** Add and serialize `screenOn`, `deviceIdleMode`, `powerSaveMode`, and `appStandbyBucket`; collect safely using current Android APIs with compatible fallbacks. Tests must cover the serialization/model boundary where platform runtime is unavailable.
4. **2.8 `ws_closed_event`:** For persistent `CanaryWebSocketKeeper`, immediately emit a journal event from both `onClosed` and `onFailure`; include `connectionId`, `ageSec`, `closeCode` (when available), `exceptionClass` (for failure), stable `networkType`, `screenOn`, and `detectedBy` = `callback`. A probe failure may separately record `detectedBy` = `probe`, but it must not duplicate the same closure callback event. Wire this through a small testable callback/reporter interface rather than Android-runtime-dependent static code. Preserve `pingInterval(0)`, echo-only probe and 5-second timeout.

Do not alter production server/infrastructure, secrets, credentials, TLS pins, signing configuration, package/version fields, 2K WIP full-run classes, or unrelated UI. Never read/print/write `.env*`, `secrets.properties`, keys, keystores, `local.properties`, APKs, build outputs, or production data. No deployment/service restart/install/external write.

## Verification and commit
- Run `./gradlew testReleaseUnitTest` in `canary-v4/android`.
- Run `node --test test/server.test.mjs` in `canary-v4/server`.
- Run `git diff --check` at repo root.
- Ensure staged paths exclude secrets/local config/APKs/build outputs and leave pre-existing committed 2K WIP intact.
- Commit exactly: `TASK-001d-2I: complete light-run diagnostics`
- Push to `origin/codex/task-001d-canary-v4`.

## Report
Return changed files, exact verification outcomes, commit hash and push result. State what was deliberately left for 2K/2L.