# TASK-001d-2G — Exact-alarm fallback and service resilience (v4.0.3)

## Status
Approved by Arslan after a real device crash on 2026-09-29.

## Device failure to fix
`SecurityException: Caller net.hearth.canary.v4 needs to hold SCHEDULE_EXACT_ALARM or USE_EXACT_ALARM` from `AlarmManager.setAlarmClock`, invoked by `CanaryWatchdogScheduler.scheduleNext` during `CanaryMonitorService.onCreate`.

## Goal
The monitor must never crash because exact alarms are unavailable or because an alarm/service/run operation throws. It must leave a durable, useful journal `cycle_error` record, continue operating with a fallback schedule, and expose exact-alarm remediation in Readiness.

## Scope
You may modify only:
- `canary-v4/android/app/build.gradle.kts`
- `canary-v4/android/app/src/main/AndroidManifest.xml`
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanaryWatchdogScheduler.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanaryMonitorService.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/CanaryAlarmReceiver.kt` if necessary for exception containment
- existing journal/model classes under `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/` if necessary for durable `cycle_error`
- `canary-v4/android/app/src/main/java/net/hearth/canary/ui/CanaryJournalUiModels.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/ui/CanaryReadinessModels.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/MainActivity.kt`
- `canary-v4/android/app/src/main/res/values/strings.xml` if needed
- focused unit tests under `canary-v4/android/app/src/test/`

Do not alter TLS/pinning, application ID, namespace, Kotlin packages, signing, secrets, dependencies, or unrelated code. Do not modify any file outside this repo.

## Requirements

### 1. Manifest permissions
Add exactly these declarations:
```xml
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />
```
Retain other permissions.

### 2. Watchdog fallback — no crash
Before calling `setAlarmClock`, on API 31+ check `alarmManager.canScheduleExactAlarms()`.
- If true (or pre-31), retain `setAlarmClock` behavior.
- If false, schedule with `setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)` instead of `setAlarmClock`.
- Log an explicit durable `cycle_error` journal event explaining that exact alarm permission is unavailable and fallback scheduling was used.
- If either scheduling API throws, catch `Throwable`/the relevant runtime failures, log durable `cycle_error`, and do not propagate the exception.
- In either fallback/error case, update monitor scheduling state in a way consistent with existing state/readiness behavior so the service can continue.

### 3. Comprehensive fault containment
The application must not crash from an error in service lifecycle, alarm scheduling, alarm receiver dispatch, or a network run:
- Catch failures around `onCreate`, `onStartCommand`, `onDestroy`, cadence runnable, watchdog scheduling, and the full run-cycle body.
- Log each failure as durable `cycle_error` where journal access is possible.
- A `cycle_error` record includes fields: `exceptionClass`, `message` (nullable/empty allowed), `stack` containing at most the first 20 stack-trace lines. Include suitable phase/context if the existing journal format supports it.
- Always release `CanaryRunGate`, run resources, and retain/re-establish cadence/watchdog scheduling in `finally` or protected fallback flows. Never rethrow caught operational failures.
- Prevent a journal-write failure from becoming a new crash (best-effort protected logging).

### 4. Readiness
- Exact-alarm denial must be a red Readiness item.
- Show the `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` button only when API >= 31 and `canScheduleExactAlarms()` is false. The button must use package URI and gracefully fall back to app settings.
- It is acceptable to retain other existing readiness remediation controls.

### 5. Journal export root metadata
The root JSON object produced by journal export must additionally include:
- `deviceModel`: `Build.MANUFACTURER` + `Build.MODEL` (safely normalized; do not crash)
- `androidVersion`: Android release/version information
- `miuiVersion`: MIUI version if detected, otherwise empty string. Detect best-effort using public system properties/reflection defensively; no crash if inaccessible.

Existing `deviceLabel` remains editable on the Readiness screen. Keep its existing UI and persistence behavior intact.

### 6. Version
In `defaultConfig`: `versionCode = 40003`, `versionName = "4.0.3"`.

## Tests
Add or update focused, JVM-safe unit tests for pure formatting/decision behavior added (e.g. cycle-error payload stack truncation, export metadata serialization, readiness exact-alarm presentation). Do not mock Android framework in JVM unit tests unless the project already supports it.

## Agent safety
- `AGENTS.md` prohibits modifications outside this repository. Do not create backup copies; Hermes has captured the pre-edit state through Git and will manage external artifacts.
- Do not read, print, modify, stage, or commit secrets, env files, keystores, signing properties, generated artifacts, or `local.properties`.
- Do not run Gradle, prebuild, native builds, emulator, adb, commit, or push. Hermes performs all verification/packaging.

## Final response
List changed files, behavior implemented, tests added (do not run Gradle), and limitations.