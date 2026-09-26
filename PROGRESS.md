# Progress

## TASK-001

Status: in_progress

Notes: Canary implementation is present for APK/dev-build verification. This task must remain `in_progress` until Hermes receives at least 14 days of live journal data from the participant.

## TASK-001-SEC-01

Status: accepted-for-review

Notes: Expo/React Native dependency baseline updated to SDK 57-compatible versions. Runtime audit now has 0 critical and 0 high vulnerabilities; moderate advisories remain in Expo tooling transitive dependencies.

## TASK-001d-1

Status: implemented

Date: 2026-09-26

Notes: Canary v4 server code added under canary-v4/server with local unit coverage for health, WebSocket echo/ping, protected upload, gzip journal ingest/deduplication, and disabled TURN credentials. Production HTTPS/TURN/service checks are intentionally not run in this step.
