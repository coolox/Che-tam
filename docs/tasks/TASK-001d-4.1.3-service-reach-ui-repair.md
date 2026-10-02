# TASK-001d-4.1.3-service-reach-ui-repair — retain manual results only in memory

## Status
Approved continuation of TASK-001d v4.1.3. Independent review found one scope violation in the implemented manual `Проверить сервисы` path: it calls `CanaryEventLog.appendLightRunRecord(...)`, which persists manual service-reach results. TASK-001d-4.1.3 explicitly requires the manual service-result UI to be local/in-memory and says “no new persistence”.

## Scope
Only Fatima changes code. Make the minimal source-only correction.

## Allowed file
- `canary-v4/android/app/src/main/java/net/hearth/canary/MainActivity.kt`

## Required correction
1. Remove the `CanaryEventLog` persistence/import and any now-unused `UUID` use from the manual service-reach code.
2. Keep the run entirely in-process and display the received `List<CanaryTestResult>` on the existing result screen exactly as now.
3. Preserve no-network-on-main-thread and request coalescing semantics.
4. Do not alter scheduling: once-daily scheduled full-run service entries remain journaled by the normal full-run pipeline.

## Prohibitions
Do not touch any other file. Do not run Gradle/build/prebuild, commit, push, access secrets, restart/deploy services, install APK, or call external write APIs.

## Hermes verification after edit
`./gradlew testReleaseUnitTest --tests net.hearth.canary.full.CanaryServiceReachTest`

## Report
Changed files and a short statement confirming manual results are no longer persisted.
