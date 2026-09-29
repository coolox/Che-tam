# TASK-001d-2H — Background light runs and accurate network metrics (v4.0.4)

## Status
Approved by Arslan after real-device validation of 4.0.3 on 2026-09-29. Service/alarm no longer crash, but journal shows all network tests failing with `NetworkOnMainThreadException`.

## Goal
Run every light network test off Android's main thread; complete journal cycle metadata and network metrics accurately without crashes.

## Scope
Modify only files necessary among:
- `canary-v4/android/app/build.gradle.kts`
- `canary-v4/android/app/src/main/AndroidManifest.xml`
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanaryMonitorService.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanarySystemSnapshot.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanaryEventLog.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunExecutor.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunModels.kt` if needed
- focused tests in `canary-v4/android/app/src/test/`

Do not modify TLS/pins, secrets, signing, package ID, dependencies, app UI, or unrelated behavior. Do not modify files outside the repo.

## Requirements

### 1. Run off the main thread
- The entire light run (`CanaryLightRunExecutor.run()` and all HTTP/DNS/WebSocket work it invokes) must execute on a background thread, never Android main/UI thread. Use a small dedicated `ExecutorService` or equivalent safe mechanism; do not add dependencies merely for coroutines.
- The foreground service lifecycle methods must remain quick: schedule/dispatch work, do not block the main thread on network I/O.
- Preserve run-gate/resource lifetime and error containment. The gate must remain held through the actual background run and reliably release afterward; watchdog/cadence behavior must continue.
- Add a focused JVM-safe test or testable pure helper/guard that demonstrates the light-run dispatch rejects/does-not-run on the main thread. Do not use Android instrumentation or mock framework unless already supported.

### 2. cycle_start correlation
- Each cycle gets a `runId` generated before `cycle_start`; write `runId` and `timestampUtc` into `cycle_start`.
- The same `runId` must be used by every test result and `run_summary` produced by that cycle.
- Update data model/journal serialization and focused tests.

### 3. Network snapshot
`ACCESS_NETWORK_STATE` and `ACCESS_WIFI_STATE` must be declared in the manifest (retain them if already present).

For `networkType`, `wifiRssi`, and `wifiLinkMbps`:
- Obtain `ConnectivityManager.getNetworkCapabilities(activeNetwork)`.
- Derive network type as `wifi` for `TRANSPORT_WIFI`, `cellular` for `TRANSPORT_CELLULAR`, otherwise a stable meaningful value such as `other`/`unknown` (document through code).
- On API 29+, obtain `WifiInfo` from `NetworkCapabilities.transportInfo` where it is a `WifiInfo`, and take RSSI/link speed from it.
- Do not use deprecated `WifiManager.connectionInfo` as the primary source. Gracefully return null if unavailable/not Wi-Fi; never create fake sentinel values such as -127/-1.
- Include `networkType` in cycle-start fields/payload, in addition to Wi-Fi metrics.

### 4. Per-test traffic counters
- Before and after each individual HTTP/DNS/WebSocket test, sample `TrafficStats.getUidTxBytes(Process.myUid())` and `getUidRxBytes(...)`.
- Store non-negative deltas as `bytesTx` and `bytesRx` on that test result. If counters unavailable (`-1`) or sampling fails, leave values null; never record a negative value.
- Ensure every test type, including the persistent WebSocket check, has these fields where supported.
- Keep instrumentation safe in the face of test exceptions.

### 5. resolvedAddresses JSON
Serialize `resolvedAddresses` as an actual JSON array (`JSONArray`), never via `List.toString()` / JSON string. Preserve empty array for no addresses. Add an assertion in focused tests that the export payload exposes a JSON array.

### 6. Version
Set `versionCode = 40004`, `versionName = "4.0.4"` in defaultConfig.

## Acceptance / tests
Add/update focused JVM-safe unit tests for new serializable model/logic. Do not run Gradle, builds, adb, emulators, commit, or push; Hermes handles verification and release artifact.

## Safety
- AGENTS.md prohibits changes outside the repository: do not create backups anywhere.
- Never read, print, modify, stage, or commit secrets, `.env*`, keystores, signing props, generated artifacts, or local.properties.

## Final response
Report changed files, exact implementation summary, tests added but not run, and any runtime limitations.