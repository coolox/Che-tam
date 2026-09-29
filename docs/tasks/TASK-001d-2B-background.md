# TASK-001d-2B — Canary v4: фоновое выполнение и старт прогона

## Статус

Approved by Arslan in direct Telegram message, 2026-09-28. Выполняется после принятого bootstrap `TASK-001d-2a` и отдельной Git hygiene-проверки. Это шаг **B** TASK-001d-2.

## Выдержка из спеки

Из `docs/tasks/TASK-001d-canary-v4.md`, разделы «Фоновое выполнение» и «Поля записи, тайминги, итог прогона»:

- Постоянная foreground-служба типа `specialUse` с постоянным уведомлением, а не `dataSync`; служба запускает прогоны каждые 15 минут.
- Будильник-сторож `AlarmManager.setAlarmClock()` каждые 15 минут с запасом 2 минуты после ожидаемого прогона. Если служба жива и прогон уже был, только переставляет себя; иначе поднимает службу и запускает прогон.
- Ресиверы: `BOOT_COMPLETED`, `QUICKBOOT_POWERON`, `MY_PACKAGE_REPLACED`.
- Только на время прогона: partial wakelock не дольше 3 минут и Wi-Fi lock `WIFI_MODE_FULL_LOW_LATENCY`.
- Наложение не допускается: если цикл уже выполняется, новая попытка записывает `cycle_skipped`.
- В начале каждого прогона записывается `cycle_start` с `wakeupMethod`, `scheduledAt`, `delayMs`, `missedSinceLast`, `batteryPct`, `isCharging`, `batteryOptimizationIgnored`, `exactAlarmAllowed`, `notificationsAllowed`, `uptimeSec`, `processStartedAt`, `wifiRssi`, `wifiLinkMbps`.

## Scope

Repository: `/root/projects/che-tam`; branch: `codex/task-001d-canary-v4`.

Implement only the native Kotlin Canary code under `canary-v4/android/` necessary for this slice:

1. Add the foreground monitoring service and manifest declarations.
   - Android `foregroundServiceType="specialUse"` and the required special-use subtype property in the service declaration.
   - Persistent, user-visible notification/channel appropriate for the service.
   - Add only necessary Android permissions/declarations for this task’s scheduling, notification, boot, wake-lock and Wi-Fi-lock behavior.
2. Schedule the regular service cadence every 15 minutes and the watchdog with `AlarmManager.setAlarmClock()` at expected cycle time + 2 minutes.
3. Implement receivers for `BOOT_COMPLETED`, `QUICKBOOT_POWERON`, and `MY_PACKAGE_REPLACED`, restarting/scheduling the monitor appropriately. Ensure receiver behavior is safe under modern Android background-start rules.
4. Enforce a no-overlap gate shared by service/alarm/manual entry points. A collision writes `cycle_skipped`; otherwise the beginning of each cycle writes complete `cycle_start` fields from the spec.
5. During an active cycle only, acquire/release partial wakelock with a hard timeout <=3 minutes and Wi-Fi low-latency lock. Never retain either lock while idle, on collision, or after exceptions.
6. Implement pure, unit-testable scheduling helpers for exactly:
   - `delayMs`: delay from an instant to the next 15-minute slot (never negative; expected boundary behavior documented in tests);
   - `missedSinceLast`: count missed 15-minute slots since the previous cycle according to tests.
7. Add focused JVM unit tests for `delayMs` and `missedSinceLast`.

## Deliberate boundaries

- Do not implement the nine network tests, OkHttp, WebSockets, pinning, Room/SQLite, journal export/share UI, full runs, uploads, TURN, server API changes, or production server work. Those are later steps.
- A minimal internal append-only cycle-event abstraction is permitted only insofar as it allows `cycle_start`/`cycle_skipped` to carry the fields above and will be extended by the later Room slice. Do not introduce Room in this step.
- The app may remain a minimal placeholder UI; do not implement TASK-001d-2E screens now.
- Do not touch `/root/canary-data`, `canary-v4/server/`, root `android/`, Expo/UI Preview files, or any service/VPS configuration.

## Security and implementation rules

- First read `AGENTS.md`, this file, and the referenced portions of `docs/tasks/TASK-001d-canary-v4.md`.
- Before each edit, write its backup only under `/root/backups/codex/` with a timestamped name preserving enough path context. Never create `.bak` inside the repository.
- Do not read, print, modify, request, commit, or create `.env`, `secrets.properties`, keystores, signing properties, passwords, tokens, keys, databases, or production data.
- Do not introduce real secret values or server changes.
- Touch only files necessary under `canary-v4/android/` plus this task file only if a factual implementation note is needed. Do not modify `PROGRESS.md`.
- Do not commit or push.

## Verification allowed to Fatima

- Run the focused JVM unit tests for the helper logic.
- Run static checks/lint/type checks that do not invoke Android native compilation.
- **Never** run Gradle tasks, any Android build, prebuild, APK packaging, adb, emulator, device, long-lived process, or service restart. Hermes runs Gradle independently.

## Acceptance criteria for Hermes

1. Manifest has special-use foreground service and required subtype property; persistent notification is implemented.
2. Cadence and watchdog use the stated schedule (15 min; watchdog +2 min via `setAlarmClock`).
3. All three receivers are declared and route to monitor restart/schedule logic.
4. Locks cannot outlive a run and wakelock timeout is <=3 min.
5. Overlap creates `cycle_skipped`; non-overlap starts exactly one `cycle_start` containing every listed field.
6. Focused tests cover normal/boundary delay and missed-slot calculation and pass.
7. Hermes independently runs Gradle verification; if it fails, return the complete error to Fatima. Two failed Fatima correction attempts for this step require stop/report to Arslan.

## Required final report

- Summary and exact files changed.
- The exact test/check commands run and outcomes.
- Confirmation that backups were written only to `/root/backups/codex/`.
- Explicit confirmation: no Gradle/build/prebuild/adb/emulator/service/server actions, secrets, commits, or pushes.
- Assumptions/limitations, especially any Android API/permission caveat.
