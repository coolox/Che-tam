# Task: APP-000 — постоянный Android application ID

- **ID:** `APP-000`
- **Status:** approved
- **Owner:** Hermes
- **Implementation agent:** Фатима
- **Depends on:** pushed `feat/app-phase-1-3` at `321e062`.

## Goal

До первой установки реального приложения окончательно отделить его Android package identity от Canary: APK «Чё-Там» должен иметь `net.hearth.chetam`. Это позволяет устанавливать его рядом с замороженной Canary `net.hearth.canary` и делает идентификатор постоянным до публикации.

## Context

- `app.json` сейчас содержит отображаемое имя «Чё-Там», но старые `slug` и Android package identity Canary.
- Canary `codex/task-001d-canary-v4`, `canary-v4/**`, historical Canary files и их идентификаторы не являются частью этой задачи и не изменяются.
- Это изменение native Android identity; после кода Hermes один раз выполняет release build и проверяет manifest metadata.

## Allowed scope

Фатима может изменять только:

- `app.json` — `expo.slug` и `expo.android.package`;
- `package.json` — только root `name` и `version`;
- `android/app/build.gradle` — `namespace` и `defaultConfig.applicationId`, только если эти значения сейчас Canary;
- `android/app/src/main/java/**/MainActivity.kt` и `MainApplication.kt` — перемещение в `net/hearth/chetam/` и обновление Kotlin `package` declarations;
- focused unit-test files only if an existing test directly asserts an old application identifier;
- этот task-файл — factual implementation note only.

Не менять:

- `canary-v4/**`, `src/nativeMonitor.ts`, `src/storage.ts`, `src/exportJournal.ts`, `src/schedulePolicy.ts`, `src/types.ts`;
- любые серверные, secrets, credentials, build output, Gradle wrapper/dependencies, lockfiles, manifests кроме тех, которые generated/managed by Expo и требуют только package declaration update (в случае сомнения — остановиться);
- UI, domain layer, auth, transport, calls, notifications.

## Requirements

- [ ] `app.json`: `expo.slug` = `che-tam`; `expo.android.package` = `net.hearth.chetam`.
- [ ] `package.json`: root `name` = `che-tam`; `version` = `0.6.0`.
- [ ] `android/app/build.gradle`: Android `namespace` и `defaultConfig.applicationId` = `net.hearth.chetam`.
- [ ] `MainActivity` and `MainApplication` physically reside under `android/app/src/main/java/net/hearth/chetam/`; their package declarations match the path and new ID.
- [ ] Old files under `android/app/src/main/java/net/hearth/canary/` are removed/moved, not duplicated.
- [ ] No `net.hearth.canary` remains anywhere in tracked application source/configuration outside `canary-v4/**` and documentation.
- [ ] No Canary source/artifacts or unrelated files are modified.

## Acceptance criteria

- [ ] `npm run lint`, `npm test`, `npm run typecheck` pass.
- [ ] Hermes builds a release APK once; `aapt dump badging <apk>` reports package `net.hearth.chetam` and versionName `0.6.0`.
- [ ] `git grep -n "net.hearth.canary" -- . ':!canary-v4' ':!docs'` is empty.
- [ ] Release APK has recorded SHA-256.
- [ ] No secrets, APK/build output or Canary files enter Git.

## Verification

Фатима runs only:

```bash
npm run lint
npm test
npm run typecheck
git diff --check
git grep -n "net.hearth.canary" -- . ':!canary-v4' ':!docs'
```

Hermes independently runs those checks, then runs the one permitted native verification build and records:

```bash
./gradlew assembleRelease
find android/app/build/outputs/apk/release -name '*.apk' -print
aapt dump badging <apk> | grep -E "package|versionName"
sha256sum <apk>
```

## Constraints

- Do not run `expo prebuild`, Gradle, Android build, emulator, device or APK operations; Hermes owns them.
- Do not commit or push.
- Do not change any identifier in `canary-v4/**`; it must remain a separate package.
- Stop and report if an old identifier appears in an unexpected tracked file whose role is unclear; do not mass replace.

## Codex prompt

Read `AGENTS.md`, this task, `app.json`, `package.json`, `android/app/build.gradle`, and the existing `MainActivity`/`MainApplication` paths before editing. Implement only APP-000 in the allowed scope, moving Kotlin files rather than duplicating them. Run the listed non-build checks. Return exact changed files and command outputs. Do not commit, push, access secrets, touch Canary, or run native builds.