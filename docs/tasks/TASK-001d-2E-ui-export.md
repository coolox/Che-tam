# TASK-001d-2E — Canary v4: main screen, readiness and manual journal export

## Status

Approved by Arslan in direct Telegram message, 2026-09-29. This is step **E**, after step D (`9097664`).

## Goal

Replace the bootstrap placeholder with the native operational screen required by the Canary v4 spec, backed by the step-D local Room journal. Scope is local UI/readiness/export only.

## Scope

Repository `/root/projects/che-tam`, branch `codex/task-001d-canary-v4`. Touch only files under `canary-v4/android/` plus this task file if needed.

1. Replace the placeholder `MainActivity` UI with an accessible native Android screen showing: device label (default `local-1` stored locally and editable), last run time/verdict from the local journal, 24-hour run count/server-success summary derived from stored records, app version, and readiness status.
2. Add a `Проверить сейчас` action that routes through the existing manual monitor start path; do not add a second execution path or alter monitor scheduling/network logic.
3. Add `Отправить журнал`: create a local JSON export in the app cache/files area from Room records (format name `hearth-canary-journal-v4`, exportedAtUtc, appVersion, deviceLabel, records) and invoke Android Sharesheet via FileProvider. This is manual sharing only—no HTTP upload, auth/key use, server calls, compression, or background sending.
4. Add a `Готовность` view/card assessing programmatically available checks: notification permission, battery optimization ignored, exact alarm capability, and monitor running/scheduled state if already available. For MIUI autostart, expose a clearly labelled manual guidance/action: attempt MIUI Security Center intent, with safe fallback to application details settings. Do not claim MIUI autostart was verified.
5. Add only required manifest/resources/FileProvider paths/strings. Ensure buttons have a minimum 48dp touch target and no external UI dependencies.
6. Add focused JVM tests for pure journal-summary/export/readiness formatting logic. Android intent UI/device behavior is manual-verification-only.

## Boundaries

- No modifications to Room schema/retention, WebSocket/pinning/network test semantics, full runs, TURN, uploads, automatic journal upload, server/VPS, secrets/signing/version, root Android/Expo.
- Never read, print, modify, create, or commit `secrets.properties`, `.env`, keys, signing files, or production data.
- Back up each edited file only under `/root/backups/codex/`, never `.bak` in the repository.
- Do not run Gradle/build/prebuild/APK/adb/emulator/service; do not commit/push.

## Acceptance for Hermes

- Placeholder is replaced with main status screen and three specified actions.
- Export uses FileProvider/standard Sharesheet and contains Room records without secret material.
- Readiness does not falsely claim MIUI autostart verification.
- Focused tests cover pure local logic.

## Required final report

Exact changed files; tests/checks run; backup confirmation; explicit no secrets/build/device/server/commit/push; limitations/manual checks.
