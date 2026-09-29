# TASK-001d-2C — Canary v4: лёгкий сетевой прогон

## Статус

Approved by Arslan in direct Telegram message, 2026-09-28. This is step **C** of TASK-001d-2, after accepted background monitor step B.

## Spec extract

From `docs/tasks/TASK-001d-canary-v4.md`:

- Light run writes exactly **9 test records**: `control_http` HEAD for `www.apple.com`, `www.microsoft.com`, `yandex.ru`, `www.gismeteo.ru`, `www.cloudflare.com`; `control_dns` for `turkmenportal.com`; `dns_resolve` for `vmi3376157.contaboserver.net`; `http_domain` GET `https://vmi3376157.contaboserver.net/hearth-canary/`; and `ws_keepalive`.
- Use OkHttp `EventListener` phases: `dnsMs`, `tcpMs`, `tlsMs`, `httpMs`, `upgradeMs`. `null` = stage never began; `-1` = began and failed in that stage.
- Valid error categories: `none`, `dns_nxdomain`, `dns_timeout`, `dns_invalid_address`, `tcp_timeout`, `tcp_refused`, `tcp_reset`, `tls_timeout`, `tls_reset`, `tls_handshake_error`, `tls_pin_mismatch`, `http_error`, `ws_upgrade_failed`, `ws_closed`, `ws_timeout`, `turn_error`, `no_network`, `other`. Success always has `none`.
- Loopback/private DNS results are invalid: `127.x`, `10.x`, `192.168.x`, `172.16–31.x`, `0.0.0.0` => `dns_invalid_address`; persist/write last 10 addresses plus `previousIp`/`changed`.
- TLS pinning accepts **either of two pins** in local `secrets.properties`. Never embed, print, inspect, or alter pin values.
- Include `addressFamily` as `ipv4`/`ipv6` in relevant DNS/network records.
- Service retains one WebSocket. Light run checks it using ping and 5-second response wait; writes `connectionId`, `ageSec`, `sameProcess`; dead socket is logged and reopened.
- Final record is `run_summary` containing `testsTotal`, `testsOk`, and `runVerdict`: `ok`, `offline`, `server_blocked`, `dns_only`, `sni_filter`, or `partial`. For a light run, only verdicts derivable without direct-IP probes should be emitted; do not falsely claim `dns_only`/`sni_filter`.

## Scope

Repository `/root/projects/che-tam`, branch `codex/task-001d-canary-v4`. Change only code/tests/resources/build config required under `canary-v4/android/` and this task file if needed. Extend the Step B monitor to execute the light run.

1. Implement a production-shaped light-run model and executor for exactly the nine records above.
2. Use OkHttp and `EventListener` instrumentation; supply phase semantics exactly as specified.
3. Implement testable error classification and private/loopback address validation, including the valid 172.16/12 boundary behavior and address-family detection.
4. Load two certificate pins only from already-existing local `secrets.properties`. The code must handle missing/non-secret configuration without printing values. Do not read that file or its contents in your agent session.
5. Implement service-owned keepalive WebSocket lifecycle and ping check. Use the production endpoint above; no server changes or write calls.
6. Implement testable run verdict derivation and append `run_summary` after every light run.
7. Integrate with Step B’s cycle events without Room (Room belongs to D). Use an internal append-only/event abstraction compatible with later persistence.
8. Add JVM unit tests for error categories, `runVerdict`, invalid/private addresses, address family, phase defaults/failed-stage semantics as appropriate.

## Boundaries

- No Room/SQLite, export/share UI, device-label UI, readiness UI, full runs, TURN, uploads, journal upload, server/VPS changes, root `android/`, Expo files, or `canary-v4/server/`.
- Do not modify `/root/canary-data`, secrets, keystore/signing files, `.env`, server services, firewall, or endpoints.
- Backups before edits go **only** to `/root/backups/codex/` with timestamped names; never create `.bak` in the repo.
- Do not commit/push.

## Verification allowed to Fatima

Run focused JVM unit tests only. Do not run Gradle, Android builds/prebuild, APK packaging, adb, emulator/device, service restarts, or long-lived processes. Hermes independently performs Gradle/build verification.

## Acceptance criteria for Hermes

1. A light run produces the specified 9 test records and a final summary record.
2. EventListener phases obey null/-1 semantics; classification maps success to `none`.
3. Loopback/private DNS addresses cannot produce success and classify as `dns_invalid_address`; IPv4/IPv6 classification is correct.
4. Pin configuration supports either local pin without exposing values.
5. Keepalive fields and ping/reopen behavior exist in service-owned lifecycle.
6. Unit tests for classifier, verdict, and private addresses pass; Hermes release-unit-test and release assembly pass.
7. Build failure: return full error to Fatima; two failed Fatima correction attempts on this step => stop/report Arslan.

## Required final report

Summary; exact changed files; test commands/outcomes; confirmation that backups are only in `/root/backups/codex/`; explicit confirmation that no secrets, server work, Gradle/build/prebuild/adb/emulator, commit or push occurred; limitations/assumptions.
