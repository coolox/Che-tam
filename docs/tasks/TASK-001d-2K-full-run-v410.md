# TASK-001d-2K — TASK-001d-3: полный прогон, TURN, upload, бюджет и ночная выгрузка (v4.1.0)

## Status
Approved by Arslan. This is the first isolated implementation slice of v4.1.0. Make a single focused commit and push it to `origin/codex/task-001d-canary-v4` when all required verification succeeds.

## Required reading
Read `AGENTS.md`, `docs/spec.md`, `docs/tasks/TASK-001d-canary-v4.md`, the existing Android light-run/journal/schedule code and its tests before editing. Preserve all accepted v4.0.5 behavior.

## Version and scope
- Set the Android release version to `versionCode 40100`, `versionName "4.1.0"`.
- Implement TASK-001d-3 only: hourly full run, TURN client probes, upload probes, server-traffic budget, and nightly journal upload.
- Do **not** implement 2L (`ws_closed_event`, `ws_heartbeat`, `fcm_reach`, `imo_reach`), deploy/restart services/nginx/coturn, modify infrastructure, read/write secrets, change TLS pins/keystores/secrets.properties, install APK, or modify server production data.
- Do not add dependencies unless absolutely necessary. Prefer existing OkHttp/platform APIs and small testable Kotlin helpers.

## Functional requirements

### Scheduling and run model
1. The 15-minute cadence remains. Each UTC-hourly slot runs a `full` run instead of a light run; other slots run `light`.
2. Do not overlap runs; retain the existing gate and watchdog behavior.
3. Persist individual test results plus one `run_summary` for each run. `runKind` must be correctly `light`, `full`, or `upload`.
4. Full run includes the existing light checks plus exactly these added test types: `ws_domain`, `ip_direct` (two SNI modes, HTTPS+WS), `doh_resolve` (Cloudflare/Google/Quad9), `latency_sample`, `turn_tls`, `turn_tcp`.
5. Use bounded timeouts; an unavailable network must yield a result record, not crash/cancel the rest of the journal.

### Full-network checks
- `ws_domain`: fresh domain WSS connection, echo payload, then close.
- `ip_direct`: test direct IP over HTTPS and WSS with SNI server-name plus neutral `www.example.com`. Use existing pinning but hostname verification must not invalidate the direct-IP experiment. Record SNI/mode and phase/error outcome.
- `doh_resolve`: query Cloudflare, Google, Quad9 DoH JSON endpoints for the server hostname. Record each provider independently and validate returned address as existing DNS guard does.
- `latency_sample`: fresh WS, ten echoed payloads one second apart; persist individual values/count and min, median, p90, max, lost in one test record.

### TURN
- Obtain expiring TURN REST credentials only from existing authenticated `GET /hearth-canary/turn-cred`; never persist/print credentials.
- Implement a minimal RFC 8656 client sufficient for the existing isolated coturn design: Allocate with auth challenge/retry, CreatePermission for the configured local echo peer, Send indication/Data indication and 8 KiB echo, separately for TLS:5349 and TCP:3478.
- Result type names exactly `turn_tls` and `turn_tcp`; capture fields where available: `connectMs`, `tlsMs`, `allocateMs`, `echoRttMs`, `echoBytes`, `throughputKbps`, `turnErrorCode`. No UDP public probe.
- Any credential/protocol/network failure yields `turn_error`, no secret in error text.

### Uploads and traffic budget
- Every 6 hours make three `payload_upload` probes (20 KiB, 120 KiB, 500 KiB); once per UTC day add one 2 MiB probe. Send non-secret random bytes to authenticated `/hearth-canary/upload`; record payloadBytes, bytesConfirmed, throughputKbps, HTTP status.
- Maintain a UTC-day counter of **traffic sent to our server**. Do not count controls/DoH. If more than 10 MiB sent, suppress full/TURN/upload work until the next UTC day but continue light runs. Append a `budget_paused` record containing `bytesToday`; do not emit unbounded duplicates (at most once per UTC day).
- Count actual available TrafficStats deltas and conservatively include upload payload bytes when UID accounting is unavailable.

### Nightly journal upload
- Schedule one attempt daily at local 03:00 plus a randomized 0–30 minute offset, without disrupting normal monitoring. A failed nightly upload must retry from the next full run.
- Select unsent journal records, serialize canonical journal payload, gzip, and POST authenticated to `/hearth-canary/journal`.
- Mark records sent only after successful response. No secret/header/body content in journal error fields or logs.
- Use bounded batch size so uploads remain inside budget; preserve unsent records after failures.

### Tests
Add focused JVM tests for at least:
- full-vs-light hourly schedule decision;
- UTC upload schedules (6-hour small uploads, daily 2MiB) and one-per-day budget pause;
- budget reset/suppression behavior;
- DoH parsing/address validation helper;
- latency aggregate calculation (including loss);
- TURN message framing/auth helper parsing (pure functions, no production network);
- payload size/throughput helpers;
- journal upload selection and only-mark-sent-after-success behavior, using fakes/pure helpers;
- no secret values or auth headers exposed by error formatter.

## Verification and delivery
1. Run `./gradlew testReleaseUnitTest` in `canary-v4/android`.
2. Run `node --test test/server.test.mjs` in `canary-v4/server` to guard existing server endpoint behavior.
3. Run `git diff --check` from repo root.
4. Inspect staged paths and ensure no `secrets.properties`, `.env*`, keystore, `local.properties`, APK/build artifacts, or production data are staged.
5. Commit with message exactly `TASK-001d-2K: add full Canary run` and push to `origin/codex/task-001d-canary-v4`.

## Final report
Report changed files, exact test outcomes, commit hash, push result, and explicit limitations. Do not claim production deployment or APK build/install; Hermes handles integration/deployment/release.