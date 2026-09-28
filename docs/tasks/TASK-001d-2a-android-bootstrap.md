# TASK-001d-2a — Canary v4 Android: isolated bootstrap

## Статус

Approved by Arslan in direct Telegram message, 2026-09-28. This is step **a** of TASK-001d-2.

## Scope

Create the new, isolated native Kotlin Android project **only** at `canary-v4/android/`. Do not read, modify, reuse, or build the root `android/` directory: it is the unrelated Expo/React Native UI Preview.

The project must be ready for later TASK-001d-2 steps, but this task intentionally delivers a minimal launchable blank app only.

## Required configuration

- Package/application ID: `net.hearth.canary`
- Kotlin Android app; minSdk 26; targetSdk and compileSdk 35.
- Version name `4.0.1`, versionCode `40001`.
- Gradle wrapper and Android Gradle Plugin compatible with JDK 17.
- Use only stable AndroidX/Material dependencies actually needed for a blank launchable screen. No network/database/background-service implementation yet.
- The app must display a simple explicit placeholder such as `Hearth Canary v4` and version `4.0.1`.

## Local secret/signing inputs already prepared by Hermes

These are outside the scope of Codex and must NOT be read, printed, changed, committed, or requested:

- `canary-v4/android/secrets.properties` exists locally, mode 600. It contains endpoint key/pins for later tasks.
- `/root/canary-data/signing/canary-v4-release.properties` exists locally, mode 600. It gives the release signing configuration.
- `/root/canary-data/signing/canary-v4-release.jks` exists outside Git.

The Gradle release signing configuration must load `/root/canary-data/signing/canary-v4-release.properties` only if present, and configure `release` signing from it. Do not print secret property values. A missing signing-properties file should fail the release build with a clear non-secret message.

## Git hygiene

Add exact ignore rules (do not broadly ignore source):

- `canary-v4/android/secrets.properties`
- `canary-v4/android/.gradle/`
- `canary-v4/android/build/`
- `canary-v4/android/app/build/`

Do not commit APKs, keystores, credentials, generated local properties, `.bak` files, or Gradle caches.

## Files expected

Create only the normal files required beneath `canary-v4/android/`, plus modify repository `.gitignore` and `PROGRESS.md`. Do not touch server files, `android/`, Expo files, or unrelated docs.

## PROGRESS

Add a short `TASK-001d-2a` entry: bootstrap implementation prepared; Hermes will independently compile/sign/package the APK after code review.

## Verification allowed for Codex

- Static Gradle configuration inspection only if useful.
- Do NOT run Gradle, any Android build, prebuild, emulator, adb, or native compilation. Hermes owns that.
- Do NOT commit or push; Hermes will independently inspect, build, then commit/push.

## Required final report

List changed files, explain release-signing setup without exposing secrets, and disclose any assumptions/blockers.
