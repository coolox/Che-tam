# TASK-001d-4.1.3 — TURN credential compatibility and full-run observability

## Status
Approved by Arslan. Implement one focused Android v4.1.3 commit. Field journal: full run works, but `turn_tls`/`turn_tcp` fail before TURN with `JSONException: No value for password`; live server returns TURN REST standard `credential`, not `password`.

## Read first
Read `AGENTS.md`, existing v4.1.2 Android code/tests, `canary-v4/server/src/turn-cred.mjs`, and canonical plan. Do not access/print secret data. Server source can be read only for field schema; do not modify server, services, config, infra, or production data.

## Required behavior

1. **TURN credentials (highest priority)**
- Parse a successful `/turn-cred` JSON response using `username`, `credential` (standard TURN REST), `ttlSec`; accept legacy `password` only as a backward-compatible alias. If neither credential field exists/nonblank, record a clear redacted TURN error, not raw JSONException.
- Validate username is a valid expiry-prefixed TURN REST username (`<positive epoch seconds>:<nonempty suffix>`), and `ttlSec` is a positive bounded number. Reject expired/implausible values safely. Do not log username/credential/key.
- Add JVM tests using a sanitized literal example structurally matching **live server contract**: `{"ttlSec":600,"username":"1900000000:hearth-canary","credential":"example-credential"}`. It contains no real token/key. Cover `credential`, legacy `password`, missing both, invalid/expired username and ttl.
- Preserve actual authenticated TURN Allocate/CreatePermission/Send/Data echo sequence and fields. On real device target acceptance remains `turn_tls` and `turn_tcp` success with non-null `allocateMs`, `echoRttMs`.

2. **DoH RFC 8484 GET**
- All 3 providers must use GET `?dns=<base64url wire DNS query>` and `Accept: application/dns-message`, parsing DNS wire-format A/AAAA responses safely; no JSON `/resolve` assumptions.
- Ensure provider names are set for every success/failure record. Correct Quad9 endpoint/content route under RFC8484.
- Add tests for query encoding and deterministic DNS wire response parsing; test all configured providers URL/accept policy.

3. **Heartbeat status, death fields and one-hour diagnostic**
- Every full run records exactly one `ws_heartbeat_status` for each 60/240/540-sec persistent heartbeat connection: `intervalSec`, `alive`, `ageSec`, `pingsSent`, `pongsMissed`; network context where available.
- Preserve `ws_heartbeat_dead` only for actual death/probe failure, without fabricating failures. Every real death record must include `intervalSec`, `ageSec`, safe close/failure reason, `screenOn`, `deviceIdleMode`, `networkType` when available, plus existing connection correlation fields.
- Make the roughly one-hour disconnect diagnosable: on every heartbeat close/failure, capture the safe local evidence already available at that instant (callback/probe detector, close code or exception class, last inbound/outbound/ping/pong timing as available). Do not invent a cause or add server-side pings. Ensure server `canary_ws_close` retains safe duration/last-frame/correlation fields so client/server records can be correlated.
- Add focused model/helper tests for all 3 status records, death payload fields and state transitions.

4. **IP direct protocol field**
- Add serialized `protocol` to `ip_direct` result records: exactly `http` or `ws` (not ambiguous generic mode); retain SNI/mode compatibility. Tests verify both entries.

5. **Manual full upload**
- A manual full run always includes exactly one `payload_upload` of 120 KiB, independent of UTC/six-hour upload schedule. Scheduled full behavior remains as designed and must not duplicate the manual 120KiB upload. Add testable run-plan helper tests.

6. **Service reachability: one manual run + once-daily full run**
- Add a visible main-screen action labelled exactly `Проверить сервисы`. It starts one bounded, in-process service-reach run; it does not require permissions, does not open a browser, and does not fetch any HTTP page/body.
- Show its final results on a separate in-app screen as a scrollable list. Every target must show `✓` or `✗`, measured time and a safe error summary when failed. Keep this local/in-memory UI: no new persistence/UI frameworks and no network on the main thread.
- Run the same complete service-reach suite exactly once per UTC day as part of the scheduled full run. A manual service run must not change the ordinary full-run cadence/budget semantics. Coalesce concurrent service requests safely; never overlap network probes.
- For each TCP/TLS target, record one journal entry with `testType="service_reach"` and fields: `service`, `host`, `port`, `protocol`, `success`, `errorCategory`, `tcpMs`, `tlsMs`. `protocol` is exactly `tls` for TLS targets. Use a 10-second end-to-end timeout per target. Connect TCP, then perform only a TLS handshake. For hostname targets set TLS SNI to the hostname; do not send an HTTP request. The numeric Telegram DC target (`149.154.167.50:443`) has no SNI.
- Use the following named target groups. Default port is 443 unless shown:
  - Google: `www.google.com`, `play.google.com`, `play.googleapis.com`, `mtalk.google.com:5228`, `fcm.googleapis.com`, `firebaseinstallations.googleapis.com`, `www.gstatic.com`, `www.youtube.com`.
  - Apple: `apps.apple.com`, `www.icloud.com`, `1-courier.push.apple.com:5223`, `1-courier.push.apple.com:443`.
  - Messengers: `imo.im`, `web.telegram.org`, `api.telegram.org`, `149.154.167.50:443` (Telegram DC, no SNI), `web.whatsapp.com`, `g.whatsapp.net:443`, `g.whatsapp.net:5222`, `www.viber.com`, `chat.signal.org`, `zoom.us`, `teams.microsoft.com`.
  - Cloud: `s3.amazonaws.com`, `storage.googleapis.com`, `www.cloudflare.com`, `azure.microsoft.com`, `www.hetzner.com`, `www.digitalocean.com`.
  - Other: `www.instagram.com`, `www.tiktok.com`, `vk.com`, `ok.ru`, `mail.ru`.
- Add two UDP STUN Binding Request probes: `stun.l.google.com:19302` and `stun.cloudflare.com:3478`. Each has its own `testType="service_reach"`, `service="stun"`, `protocol="udp_stun"`, host/port/success/errorCategory and `udpMs`; `tcpMs`/`tlsMs` are null/omitted. Send a standards-valid STUN Binding Request with random transaction ID and treat only a matching Binding Success response as success. No media, WebRTC call, TURN allocation or permissions.
- Add focused unit tests for target inventory, SNI/no-SNI selection, timeout/error mapping, STUN request/response validation, daily-run selection/coalescing and journal-result serialization. Never test against the public internet in unit tests.

7. **APNs reachability in every full run**
- Add an explicit `apns_reach` testType, parallel in intent to `fcm_reach`, for TCP + TLS handshake only (no HTTP/APNs protocol payload) to: `1-courier.push.apple.com:5223`, `1-courier.push.apple.com:443`, and `api.push.apple.com:443`.
- Each `apns_reach` record includes `host`, `port`, `success`, `errorCategory`, `tcpMs`, `tlsMs`; use hostname SNI and a 10-second timeout. Include this test in every scheduled and manual full run, but not in light runs.
- UI may display APNs in the full-run/service result summary, but do not add Apple credentials, PushKit, iOS code or APNs token handling.

8. **Server-enforced heartbeat silence timeout**
- For `ws_heartbeat` only, each client ping message must include `disconnectAfterSec = 2.5 × intervalSec` (a finite integer/rounded seconds value). Existing heartbeat intervals remain 60/240/540 seconds.
- Update the Canary server WebSocket protocol to validate that field on heartbeat ping, track the latest valid heartbeat ping per connection and close that connection if no ping arrives before its client-declared silence window. On this close write exactly one `canary_ws_close` record with reason `silence_timeout` and the existing safe correlation/duration fields.
- Do not enable this timer for `ws_keepalive` or ordinary WebSocket checks. A connection that never opts in via heartbeat ping must retain existing behavior. Avoid server-side keepalive pings.
- Add deterministic Android and Node tests for payload calculation/validation, timer activation only for heartbeat, close reason and no duplicate close log. Tests must use fake clocks/timers, never wait minutes.

9. **Version / test / commit**
- Set `versionCode=40103`, `versionName="4.1.3"`.
- Run `./gradlew clean testReleaseUnitTest` in android; `node --test test/server.test.mjs` in server; `git diff --check` root. Inspect staged paths; no secrets/.env/signing/local.properties/APKs/build artifacts/production data.
- Commit exactly `TASK-001d: add service reach and heartbeat timeout v4.1.3`, push origin/codex/task-001d-canary-v4.

## Prohibitions
Only Fatima changes code. Never read/edit secret files, create/deploy/restart services, external writes, APK builds/installs. No fcm_push, Apple credentials/tokens, iOS code, WebRTC media, HTTP page downloads or new runtime permissions.

## Report
Changed files, coverage of points 1–8, exact tests, hash/push. State that live-phone verification remains required for real TURN success, service accessibility, UDP STUN and APNs/FCM reachability.