# Progress

## TASK-001

Status: in_progress

Notes: Canary implementation is present for APK/dev-build verification. This task must remain `in_progress` until Hermes receives at least 14 days of live journal data from the participant.

## TASK-001-SEC-01

Status: accepted-for-review

Notes: Expo/React Native dependency baseline updated to SDK 57-compatible versions. Runtime audit now has 0 critical and 0 high vulnerabilities; moderate advisories remain in Expo tooling transitive dependencies.

## TASK-001d-1

Status: accepted

Date: 2026-09-27

Notes: Canary v4 is deployed as enabled systemd endpoint and UDP echo services on system Node.js. HTTPS `/hearth-canary/`, protected upload (including 2 MiB), gzip journal, TURN credential issuance, WebSocket echo/ping-pong and five-minute idle keepalive were verified. Coturn exposes TCP 3478 and TLS 5349 only, uses REST shared-secret authentication and permits relay peers only at the local UDP echo. UFW permits only SSH, HTTP/ACME, HTTPS, TURN TCP and TURN TLS inbound. Daily secret-excluding data archives are timer-driven under `/root/backups/canary-data/`.

Certificate renewal now uses nginx webroot HTTP-01 on IPv4/IPv6 and `reuse_key = True`; simulated renewal succeeds. The renewed certificate is valid through 2026-12-26 and retained its server SPKI. The certbot deploy hook refreshes certificate copies and restarts coturn. Server and ISRG Root X1 SPKI pins are stored only in `/root/canary-data/secrets.env`.

## TASK-001d-2a

Status: accepted

Date: 2026-09-28

Notes: Canary v4 isolated Android bootstrap prepared under `canary-v4/android/`. Hermes independently built signed release `4.0.1` and verified it with apksigner; JVM target compatibility corrected after the first build failure. APK is a bootstrap artifact; later TASK-001d-2 steps add monitoring functionality.

## TASK-001d-2a hygiene

Status: accepted

Date: 2026-09-28

Notes: Exact tracked-artifact inventory found no `.bak`, build/cache, local properties, secrets, keystores, or APK files under `canary-v4/android/`; therefore nothing was removed from Git. Local ignore policy now excludes those artifacts. Codex backups must be written outside the repository under `/root/backups/codex/`.

## TASK-001d-2B

Status: accepted

Date: 2026-09-28

Notes: Background special-use foreground monitor, persistent notification, 15-minute service cadence, setAlarmClock watchdog (+2 minutes), boot/package receivers, bounded run locks, collision records, cycle-start snapshot and schedule unit tests implemented. Hermes independently ran release unit tests and signed release assembly successfully.

## TASK-001d-2

Status: accepted

Date: 2026-09-30

Notes: Steps C–E were accepted after a 12.5-hour field run with approximately 96% scheduled-run completion and 100% Canary-server availability. The light network run uses pinned TLS and echo-only WebSocket keepalive; the app retains a Room-backed 30-day journal and provides native status/readiness plus manual FileProvider journal export. v4.0.4 is installed on field devices, including `tm-1` in Turkmenistan. Follow-on v4.0.5 calibration and log-correlation work is tracked separately as TASK-001d-2I/2J.

## TASK-001d — Canary v4.1.3

Status: сбор данных

Commit: `4be3c696cf942ffa7fbf9f30d6730a4986153b2f` (`origin/codex/task-001d-canary-v4`)

Notes: v4.1.3 APK собран, подписан и передан Арслану; установка на полевые устройства ещё не подтверждена. После установки записать: `TASK-001d — сбор данных, неделя с <дата установки 4.1.3>`.

Freeze: новых функций не добавлять. Исправления допускаются только по прямой команде Арслана и только если ломается сбор данных. Сервер Canary/nginx/coturn не менять и не перезапускать без отдельной команды Арслана. Во время сбора — только ежедневное read-only наблюдение; архив журналов обоих устройств будет собран через неделю.
