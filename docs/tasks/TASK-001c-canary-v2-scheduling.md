# TASK-001c — Canary v2 scheduling evidence and duplicate-run correction

**Status:** derived from the first v2.0.1 device journal; implementation required before a 24-hour acceptance run.

## Evidence

- Native v2.0.1 five-test runs are successful, but foreground-service executions are irregular and WorkManager runs overlap the foreground service.
- `WorkManager` periodic work is inexact by Android design and must not be presented as exact 15-minute cadence.
- App-side JS fallback creates `background` records with a deliberately unavailable resolver; it contaminates exports from a native Android release build.

## Required corrections

1. Android native runner is the only scheduler/runner on Android release builds; remove JS scheduled background runs that emit non-native records.
2. Prevent duplicate simultaneous cycles: when foreground service is active, WorkManager must act only as a recovery fallback and not run a second five-test cycle. Define an interprocess durable run lease/timestamp in SharedPreferences.
3. Persist `lastNativeCycleStartedAtUtc` / `lastNativeCycleCompletedAtUtc` and record missed cycles natively when the next native runner observes schedule gaps.
4. Make the persistent notification report last completed native cycle and active status, so device-side diagnosis is possible.
5. Do not promise exact WorkManager timing. The app documentation/UI must say “примерно каждые 15 минут”; foreground service is the intended cadence.
6. Tests must cover lease decision and missed-cycle calculation in a platform-independent Kotlin-free TypeScript model if practical.

## Verification

**Fatima's scope ends at code + tests + lint/typecheck.** She edits the Kotlin
source but does NOT compile, build, prebuild, run gradle, or touch a
device/emulator to confirm the Kotlin compiles — that compile/build check is a
separate step Hermes runs directly afterward, before the 24-hour journal
collection.

After Hermes's build step confirms the Kotlin compiles, a fresh 24-hour
journal is required. Acceptance metric is evaluated only for clean native
`native_service`/`workmanager` runs from that build, excluding historic JS
fallback and prior-build records.
