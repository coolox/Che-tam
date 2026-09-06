# TASK-001: Канарейка связности из Туркменистана

- **ID:** `TASK-001`
- **Status:** draft — ожидает данные тестового Android-устройства
- **Owner:** Hermes
- **Implementation agent:** Codex CLI

## Goal

Создать минимальное Android-приложение Canary для двухнедельного наблюдения за доступностью выделенного HTTPS-узла из Туркменистана. Приложение измеряет HTTP(S) и WebSocket связность каждые 10 минут, сохраняет результаты локально и позволяет владельцу безопасно экспортировать журнал.

## Context

Источник правды: `docs/spec.md`, разделы 2, 4.2, 5.1, TASK-001 (строки 67–96, 144–152, 221–240, 526–530).

Это только разведка. Она не реализует мессенджер, обход блокировок, туннель, аудио/видеозвонки или TURN-сервер. TURN over TLS проверяется отдельным утверждённым инфраструктурным подэтапом после появления домена и TLS.

## Prerequisites before implementation

- [x] Базовый адрес проверки: `https://vmi3376157.contaboserver.net/hearth-canary/` на текущем VPS. Новый домен для Phase 0 не покупать.
- [x] APK передаётся отдельным каналом (файлом/ссылкой от Арслана), чтобы не смешивать доставку приложения с проверкой доступности сервера.
- [ ] Известны Android-версия и марка тестового устройства.
- [x] Проверяются оба типа подключения: домашний Wi-Fi и мобильный интернет.

## Allowed scope

- `app/`, `src/`, `assets/`, `package.json`, `app.json`, `tsconfig.json`, `.env.example`
- `docs/participant-instructions-ru.md`
- `PROGRESS.md`, `BACKLOG.md`, `README.md`
- Focused tests and project configuration required for the Canary app.

## Must not change

- `/etc`, nginx, systemd, firewall, DNS, TLS configuration, other VPS projects.
- No secrets, real domains, private keys, credentials, user data, or `.env` files.
- No VPN/tunnel/obfuscation functionality, TURN deployment, LiveKit, Supabase, media streaming, or production messenger code.

## Requirements

- Expo + TypeScript Android app that can be built as an APK/dev build.
- Configured endpoint must be supplied at build/runtime through an environment variable, never hard-coded as a secret.
- Every 10 minutes, while Android permits the background task, perform one HTTPS health request and one WebSocket connect/close check.
- Capture only: UTC timestamp, test type, success/failure, HTTP status where applicable, latency, coarse network type if platform API provides it, and sanitized error category. Never collect content, phone number, contacts, IP address, precise location, or credentials.
- Keep at least 21 days of local results; cap storage and remove oldest records first.
- Screen in Russian: current connection result, last successful check, total failures for 24 hours, export button, manual "Проверить сейчас" button.
- Export must create a human-readable JSON or CSV file for manual transfer to the owner. No automatic external upload in this task.
- Include traffic estimate in the final report. Target: less than 5 MB/month for normal checks, excluding manual export and app installation.

## Acceptance criteria

- [ ] `npm run lint` passes.
- [ ] Unit tests cover result storage, retention, sanitized error mapping, and traffic scheduling policy.
- [ ] App has an Android build configuration and documents how the APK is produced.
- [ ] With a local mock HTTPS/WS endpoint, a manual check records both test outcomes.
- [ ] Export produces a journal without secrets or personal data.
- [ ] `PROGRESS.md` records `TASK-001` as `in_progress`; it may only be changed to `done` after Hermes receives at least 14 days of live journal data from the participant.
- [ ] Codex commits only the implementation and documentation for this task, with message beginning `TASK-001:`.

## Verification Hermes will run

```bash
npm ci
npm run lint
npm test
```

## Constraints

- Do not deploy or change VPS infrastructure.
- Do not require Google/FCM, VPN, Telegram, WhatsApp, Google Play, or another external application.
- Do not attempt UDP traffic or create UDP sockets.
- Stop and report any library limitation that prevents reliable background scheduling in Expo/dev build.
- Report expected traffic in KB/month and any operation that can exceed that estimate.

## Expected Codex report

- Files changed and commit SHA.
- Exact test/lint commands and outputs.
- Android build limitations and required operator steps.
- Traffic estimate and data fields written to the local journal.
