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
