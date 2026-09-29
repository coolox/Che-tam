# TASK-001d-2C — Build fix 01: OkHttp EventListener API

## Status

First Fatima correction attempt for Step C. Hermes independently ran:

```bash
./gradlew --no-daemon --max-workers=1 \
  -Dorg.gradle.jvmargs='-Xmx1024m -XX:MaxMetaspaceSize=384m -XX:+UseSerialGC' \
  testReleaseUnitTest :app:assembleRelease
```

It failed during Kotlin compilation. This is **attempt 1 of maximum 2** for this Step C compilation failure.

## Exact error

```text
> Task :app:compileReleaseKotlin
e: file:///root/projects/che-tam/canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunExecutor.kt:18:22 Unresolved reference 'Handshake'.
e: file:///root/projects/che-tam/canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunExecutor.kt:180:9 'secureConnectEnd' overrides nothing.
e: file:///root/projects/che-tam/canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunExecutor.kt:180:62 Unresolved reference 'Handshake'.

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:compileReleaseKotlin'.
> A failure occurred while executing org.jetbrains.kotlin.compilerRunner.GradleCompilerRunnerWithWorkers$GradleKotlinCompilerWorkAction
   > Compilation error. See log for more details
```

## Scope

- Change only `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunExecutor.kt` and only the minimal companion code if strictly necessary to use the **actual OkHttp version/API** configured by this project.
- Preserve the required phase-event behavior from TASK-001d-2C; do not sidestep/remove EventListener timing instrumentation.
- Do not change server code, signing, secrets, `secrets.properties`, build configuration, root Android project, persistence/UI, or task scope.
- Create backups only under `/root/backups/codex/`, never in the repo.
- Do not run Gradle/build/prebuild/adb/emulator; Hermes verifies.
- Do not commit/push.

## Acceptance

Source compiles against this project’s resolved OkHttp EventListener API while preserving timing semantics.

## Required report

Exact changed files, API correction made, backup confirmation, and explicit confirmation no Gradle/build/secrets/server/commit/push actions occurred.
