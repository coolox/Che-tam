# TASK-001b — Canary v2: мониторинг доступности собственного endpoint

**Status:** approved for implementation.

Source: `/root/.hermes/cache/documents/doc_c47dc9a53ba2_canary-v2-task-revised.md`.

## Project boundary

- Work only in `/root/projects/hearth`; this is separate from Che-Tam.
- This is standard endpoint monitoring only. No raw-IP targets, hard-coded address bypasses, SNI comparisons, tunneling, obfuscation, or traffic-filtering evasion.

## Required cycle, every 15 minutes

Independently run and write all five results: `control_dns`, `control_http`, `dns_resolve`, `http_domain`, `ws_domain`.

## Required v2 record fields

`timestampUtc`, `checkRunKey`, `testType`, `target`, `success`, `httpStatus`, `latencyMs`, `phases` (`dnsMs`, `tcpMs`, `tlsMs`, `httpMs` nullable), `resolvedIp`, `networkType`, `carrier`, `appState`, `errorCategory`, `errorDetail`.

Remove ambiguous `dns_or_unreachable`; use the revised specification categories. Explicitly log missed scheduled cycles.

## Android execution

Use a foreground service with persistent Russian notification, battery-optimization request/explanation, WorkManager fallback. Keep no automatic external upload; export locally through Android share sheet.

## UI

One Russian screen: status, last check, completed count, manual “Проверить сейчас”, “Отправить журнал”, one-time request to perform a mobile-data run with Wi-Fi turned off. No endpoint settings or input fields.

## Verification required before delivery

Lint, TypeScript, focused unit tests for record mapping/storage/retention/scheduling and a release APK build. Verify manifest permissions are limited to monitoring/background needs and no unintended sensitive permissions appear. Never claim the 24-hour 80% background requirement or Turkey/control success without real device journal evidence.
