# TASK-001d-4.1.1 — control headers-only, manual full-run UI, and remaining 2K/2L

## Status
Approved by Arslan for the Turkmenistan-bound **v4.1.1** release. Implement this as one focused Android task and one commit. The canonical requirements are `docs/tasks/TASK-001d-plan-405-410.md`; this task supersedes incomplete prior 2K WIP without discarding its useful committed helpers.

## Read first
Read `AGENTS.md`, the canonical plan, existing committed 2K WIP (`canary-v4/android/app/src/main/java/net/hearth/canary/full/`), light/monitor/UI/journal code, and focused tests. Preserve accepted 4.0.5 behavior.

## Scope
Set `versionCode = 40101`, `versionName = "4.1.1"`. Implement only Android app source/tests/task notes needed below. Do not change server code/services/infrastructure, endpoint secrets/TLS pins/signing, `.env*`, `secrets.properties`, keys, production data, or APKs. Never read, print, modify, or stage secrets. No deployment/service actions/external writes/APK installation.

## 1. Control payload cap
- Keep controls as GET and forced HTTP/1.1, success on any received HTTP response after TLS.
- Do not consume response bodies for control calls: close immediately after status/headers are available. Add `Range: bytes=0-0` on controls where compatible, but retain correct success if server ignores Range.
- Ensure body bytes are not included in control handling. Add a focused testable policy/helper test demonstrating status/header-only handling and a run-summary accounting test/fixture asserting a light-run `bytesRx` under 30 KiB for control fixtures.

## 2. Manual full run
- Add a visible main-screen button labelled exactly `Полный прогон сейчас` beside/near the existing `Проверить сейчас` action.
- It dispatches a full run immediately outside schedule with `wakeupMethod = manual_full`; it uses the same single-run gate/resources/journal flow as scheduled runs.
- Do not wait an hour. Must remain responsive; network work remains off main thread.

## 3. Complete 2K behavior
Implement all missing 2K behavior in a maintainable, bounded, failure-recording way:
- hourly full run replacing light at hourly slots;
- `ws_domain`; `ip_direct` with two SNI modes over HTTP + WS; `doh_resolve` against Cloudflare, Google, Quad9; `latency_sample`; `dns_consistency`;
- `turn_tls` 5349 and `turn_tcp` 3478, obtaining temporary credentials only via existing authenticated endpoint and echoing 8 KiB. Do not persist/log credentials; errors redact authorization material;
- `payload_upload` 20/120/500 KiB every six hours and 2 MiB daily;
- UTC 10 MiB budget for our server; suppress costly full/TURN/upload work after threshold but retain light runs; write bounded once-per-UTC-day `budget_paused`;
- nightly gzip journal upload at local 03:00 plus randomized 0–30 min, only marking records sent after server success and retrying from a later full run after failure.

## 4. Complete 2L behavior
- `ws_heartbeat`: three persistent connections/probes with 60, 240, 540 second intervals; write `ws_heartbeat_dead` per death with intervalSec, ageSec, reason, screenOn, deviceIdleMode.
- `fcm_reach`: bounded TCP+TLS reachability records for `mtalk.google.com:5228`, `mtalk.google.com:443`, `fcm.googleapis.com:443`, `firebaseinstallations.googleapis.com:443`, `android.clients.google.com:443`; add `gmsAvailable` to `cycle_start`.
- `imo_reach`: bounded TLS reachability to `imo.im:443`, independent testType.
- Preserve the already added `ws_closed_event` behavior.
- Do not implement `fcm_push` (deferred pending Firebase files).

## Tests
Add focused JVM tests for: control status/header-only policy + accounting cap; hourly/manual full scheduling; full-run helper outcomes; DoH parsing; latency stats/loss; TURN framing/secret-redacted failure helper; upload schedules; budget reset/suppression; upload acknowledgement/mark-sent semantics; heartbeat interval/dead event payload; endpoint target lists/GMS model; manual-full UI/dispatch model. Existing tests must remain green.

## Verify, commit, push
1. `./gradlew testReleaseUnitTest` in `canary-v4/android`.
2. `node --test test/server.test.mjs` in `canary-v4/server`.
3. `git diff --check` at repo root.
4. Inspect staged names: exclude secrets/local configs/keystores/APKs/build outputs/production data.
5. Commit exactly `TASK-001d: complete v4.1.1 probes` and push `origin/codex/task-001d-canary-v4`.

## Report
Changed files, test commands/outcomes, exact commit/push hash, explicit statement of deferred `fcm_push` and no production deployment/APK build.