# TASK-001d-2I — Калибровка лёгкого прогона для v4.0.5

## Status
Approved by Arslan on 2026-09-29 while 24-hour field test of v4.0.4 is in progress. This slice changes source only. Do not build, install, deliver an APK, commit, or push.

## Context
4.0.4 is working: server is reachable, summary is OK, and the persistent `ws_keepalive` has remained alive for 30–60 minutes. The following changes remove false negatives and improve journal accounting. These are deliberately limited to the light run and must not implement the separate TASK-001d-3 full-run/TURN/upload/nightly-export work.

## Scope
Modify only as needed among:
- `canary-v4/android/app/build.gradle.kts`
- `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunExecutor.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunModels.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryWebSocketKeeper.kt` only if required for aggregate traffic accounting
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanaryEventLog.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanarySystemSnapshot.kt`
- focused JVM unit tests under `canary-v4/android/app/src/test/`

Do not modify AndroidManifest permissions (they already include both required network-state permissions), UI, service/alarms, TLS pins/secrets, endpoint/infrastructure, package ID, dependencies, or unrelated code. Do not touch files outside this repository.

## Requirements

### A. Controls: any HTTP response after TLS is success
For all `control_http` targets:
- Use `GET`, never `HEAD`.
- Force HTTP/1.1 for those calls. Do not globally degrade server HTTP/2 behavior.
- A received HTTP response is `success = true` regardless of status code (including 403). Preserve the actual code in `httpStatus`.
- Network/TLS/protocol failures before a response remain failures with their classified error details/categories.
- Add focused tests for 403 success logic and the control client protocol/method policy in a testable JVM-safe form.

### B. Fresh server connections
Every test of the Canary server must use a fresh connection, not OkHttp's pooled existing HTTP connection, so `dnsMs`, `tcpMs`, and `tlsMs` are observable each time.
- For `http_domain`, construct/use a dedicated client per test with pooling disabled (`ConnectionPool(0, ...)` or equally unambiguous supported approach) and `Connection: close`.
- Do not change the long-lived `ws_keepalive`: it must remain persistent and retain its explicit echo/5-second behavior.
- Add a focused test/helper assertion for the server-client fresh-connection policy if practical without instrumentation.

### C. networkType must be serialized for test records
`cycle_start` already has `networkType`; light test result records currently serialize it as null.
- Populate a stable per-run `networkType` on every light result from the snapshot collected via `ConnectivityManager` / `NetworkCapabilities` (wifi/cellular/other/unknown).
- Reuse a single snapshot result during one run; do not reintroduce deprecated `WifiManager.connectionInfo`.
- Avoid sentinel values; failure/unavailability must be `unknown`/null as appropriate.
- Design a minimal testable helper/model boundary if needed and add focused test coverage for serialization.

### D. Traffic counters
`TrafficStats` may batch updates, so per-test zero deltas are misleading.
- Measure UID tx/rx before the whole light run and after it.
- Store the non-negative aggregate deltas only in `run_summary` as `bytesTx` and `bytesRx`; null if unavailable or invalid. The summary must not report negative values.
- Per test: serialize `bytesTx` / `bytesRx` only when the value is strictly greater than zero; serialize JSON null for zero, unavailable, or invalid values.
- Preserve safe exception handling around TrafficStats.
- Add focused pure-JVM tests for zero suppression and run-summary delta behavior.

### E. Version
Set `versionCode = 40005`, `versionName = "4.0.5"`.

## Safety and execution
- Follow `AGENTS.md`.
- Never read, print, modify, stage, or commit `.env*`, `secrets.properties`, keystores/signing material, APKs, or `local.properties`.
- Do not create backups outside the repo.
- Do not run Gradle, build, adb/emulator, install, external upload, commit, or push. Hermes will validate and decide packaging only after the 24-hour v4.0.4 test ends.

## Final report
Report changed files, tests added (but not run), `git diff --check` outcome, and traffic impact. State explicitly that no build/APK/install/commit/push was performed.