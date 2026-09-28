# TASK-001d-2a — Build fix 01: JVM target compatibility

## Status

Approved by Arslan in direct Telegram instruction on 2026-09-28 as the first correction attempt for step A. The signed release build was executed independently by Hermes and failed. This is **attempt 1 of maximum 2** for this exact failure step.

## Scope

Fix only the Kotlin/Java JVM-target configuration of the isolated Canary v4 Android project so a signed release APK can compile.

- Repository: `/root/projects/che-tam`
- Active branch: `codex/task-001d-canary-v4`
- Allowed source file: `canary-v4/android/app/build.gradle.kts`
- Do not modify any other file.
- Do not touch `/root/canary-data`, `canary-v4/server/`, root `android/`, Expo/UI Preview, secrets, keys, credentials, `.env`, or `PROGRESS.md`.

## Exact independent build failure

```text
> Task :app:compileReleaseKotlin FAILED

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:compileReleaseKotlin'.
> Inconsistent JVM-target compatibility detected for tasks 'compileReleaseJavaWithJavac' (1.8) and 'compileReleaseKotlin' (17).

  Consider using JVM Toolchain: https://kotl.in/gradle/jvm/toolchain
  Learn more about JVM-target validation: https://kotlinlang.org/docs/gradle-configure-project.html#check-for-jvm-target-compatibility
```

## Acceptance criteria

1. Java and Kotlin compilation targets are explicitly compatible (JDK 17 is the intended project baseline).
2. Preserve all existing app identifiers, SDK/version values, and release signing behavior.
3. Do not print, inspect, modify, or request signing properties/keystore/secrets.
4. Make a timestamped `.bak` copy of the changed file before editing; do not commit `.bak`.
5. Do **not** run Gradle, Android builds, prebuild, emulator, adb, or native compilation. Hermes will compile/sign/verify after your edit.
6. Do not commit or push.

## Required final report

State the exact file changed, the configuration change made, and confirm no build was run.
