# TASK-001d-2D — Canary v4: local Room journal persistence

## Status

Approved by Arslan in direct Telegram message, 2026-09-29. This is step **D**, after accepted step C (`39ecf08`).

## Goal

Persist the existing monitor cycle events and light-run records locally in Room/SQLite for 30 days, without changing network behaviour or adding export/upload/UI.

## Scope

Repository `/root/projects/che-tam`, branch `codex/task-001d-canary-v4`. Touch only files under `canary-v4/android/` plus this task file only if a factual note is necessary.

1. Add Room dependencies and KSP/KAPT configuration using the smallest compatible setup for this Kotlin Android project.
2. Add a Room database for the existing append-only `CanaryEventLog` events. Store a stable record id, timestamp and the complete event payload in a queryable form (JSON text is acceptable for polymorphic event payload), preserving event ordering.
3. Replace/extend the in-memory event log so monitor cycle events and step-C light-run records are written to Room. Do not drop existing cycle-start/cycle-skipped behavior.
4. Retain records for exactly the recent 30 days: prune older records on write/startup using UTC epoch timestamps. Provide a small repository/DAO API suited for later manual export/UI, including newest-first retrieval and count.
5. Add JVM unit tests for retention boundary and event ordering/round trip. Tests must avoid device/emulator requirements.

## Boundaries

- No changes to WebSocket/pinning/light test semantics, server, secrets, signing, build version, endpoint/VPS, uploads/journal transmission, export/share UI, readiness UI, full runs, TURN, or root Android/Expo code.
- Never read, print, modify, create, or commit `secrets.properties`, `.env`, keys, signing files, or databases outside the app source.
- Back up every edited file under `/root/backups/codex/`; never write `.bak` in the repository.
- Do not run Gradle/build/prebuild/APK/adb/emulator, service actions, commit, or push.

## Acceptance for Hermes

- The app uses Room-backed storage for event and light-run data.
- Existing monitor writes survive app process recreation (Room database) and records older than 30 days are pruned.
- DAO provides ordered retrieval/count needed by E/export.
- Focused JVM tests are added.

## Required final report

Exact changed files; tests/checks run; backup confirmation; explicit no secrets/build/device/server/commit/push; limitations.
