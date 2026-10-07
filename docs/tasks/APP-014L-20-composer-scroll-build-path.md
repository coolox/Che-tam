# APP-014L-20 — composer без потери ввода, автоскролл и release path

- **Статус:** approved by Arslan, 2026-10-07. Scope: local UI/storage/build-script bugfix only.
- **Граница:** no network/server/crypto/ADR changes, no APK/Gradle/prebuild, no commit/push.

## 1. Composer draft

Fix typing regression caused by writing every keystroke then full SQLite refresh.

- Controlled input remains source of truth while its chat is open; incoming snapshot must not overwrite typed composer state.
- Debounce persistence for about 500 ms after latest edit; flush immediately when leaving chat and when app goes to background/unmount.
- Saving/clearing draft must not execute full store refresh. Update only relevant chat preview/snapshot state.
- Serialize every database operation through a mutex/queue at expo adapter boundary so concurrent `prepareAsync` calls cannot race. Queue must recover after a rejected operation.
- Draft-save failures are non-fatal: preserve typed value and report non-blocking diagnostic; never transition app to global local-data error screen.
- Deterministic test: 30 changes within 1 second cause no more than 2 DB writes and composer never rolls back. Tests cover flush on leave/background and serialized adapter operations/recovery.

## 2. Conversation autoscroll

For own send, after list layout is ready explicitly `scrollToOffset({ offset: 0 })` for existing inverted list and add an `autoscrollToTopThreshold`. Do not yank user reading history. Add test that inspects actual FlatList props and verifies own-send callback scrolls to offset 0 after layout.

## 3. build-localtest path

`scripts/build-localtest-apk.sh` default artifact path derives package version from `package.json` (no hard-coded version); preserves argument override. Update script test.

## Allowed files

Minimal `src/messages/**`, `src/storage/sqlite/**`, `src/app/**`, `__tests__/**`, `scripts/build-localtest-apk.sh`, package/app config/version metadata only if required by a test, this task file. Do not edit ADR/spec/plan/AGENTS, docs architecture, crypto or server files.

## Checks

Focused tests + lint, full Jest, typecheck, diff check. Report exact rollout JSONL; no commit/push/build.