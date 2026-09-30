# TASK-001d-4.1.1-fix — correct incomplete 2K/2L implementation

## Status
The previous v4.1.1 implementation attempt did not produce a commit because its server test invocation transiently failed. Hermes re-ran it successfully, but code review found functional blockers below. Fix **only** these blockers; preserve useful existing work. Commit only after all verification is green.

## Mandatory reading
Read `AGENTS.md`, `docs/tasks/TASK-001d-4.1.1.md`, canonical plan, and the current changed Android source/tests. Do not access or print secret files/values. Do not deploy/restart/modify production services or build/install APK.

## Blockers to correct

1. **Control response bodies:** prove in code/test that `control_http` does not read body bytes at all after receiving headers and closes response immediately. A Range header alone is insufficient because a server may ignore it. Preserve HTTP status and “any response is success”.

2. **TURN must be a real bounded RFC 8656 probe, not a raw socket write.** The current raw 8KiB write after opening TCP/TLS is not Allocate/CreatePermission/Send/Data and must not report success as `turn_tls`/`turn_tcp`.
   - Implement a minimal TURN wire client: STUN framing; unauthenticated Allocate challenge; long-term auth retry using REALM/NONCE + MESSAGE-INTEGRITY; Allocate; CreatePermission to the configured loopback echo peer; Send indication/Data indication and verify 8KiB response.
   - Capture required timing/result fields and only report success after actual echoed data verification.
   - Keep credentials in memory only and scrub authorization/username/password from errors. Do not expose any secret values in tests/errors.
   - If no safe existing build-time API-key binding exists, add only the **property name/binding mechanism** to the build configuration without reading secret values. Release must fail with a clear missing-key message, like TLS pin config; do not hardcode/default a key.

3. **Heartbeat must be real, not synthetic dead records.** Replace unconditional fake `ws_heartbeat_dead` output with three independently persistent/managed WS heartbeat tracks at 60/240/540 seconds. Emit `ws_heartbeat_dead` only if a real socket dies or its scheduled echo probe fails, with actual age/reason/context. Keep `pingInterval(0)` and no server-side ping behavior.

4. **Direct-IP experiment must genuinely vary SNI.** Current `sni` labels do not configure TLS SNI and `ip_literal` repeats server Host header. Implement an explicit testable TLS/OkHttp mechanism for two actual SNI values (`vmi3376157.contaboserver.net`, `www.example.com`) while connecting to resolved IP, using SPKI pinning and no hostname-name rejection for this controlled experiment. Apply it to both direct HTTPS and direct WS. Record applied SNI/mode. Do not weaken hostname verification for normal domain requests.

5. **Latency sample must use one WS connection and ten echo messages one second apart**, not ten HTTP GETs. Record all values and calculated min/median/p90/max/lost.

6. **Nightly journal scheduling:** ensure exactly one attempt per local day in a persisted 03:00+random(0..30m) window, and failed attempt becomes eligible in a later full run. Current check based only on current minute is insufficient; add testable persisted decision helper and tests.

7. **Full-run accounting:** correctly classify full run summary as `runKind=full`, account actual non-negative server traffic where available, and do not double-count `payloadBytes + bytesConfirmed` as network bytes. Budget suppression must retain light run only and bounded one daily `budget_paused` record.

8. Keep/add tests that test behavior, not merely constants: TURN binary message/auth helper; no fake heartbeat; actual SNI factory/request policy; WS latency aggregation; nightly persistence/retry; manual full dispatch; control no-body behavior. Existing Android and Node tests must pass.

## Safety
Never read/print/write `.env*`, `secrets.properties`, keys/keystores, local.properties, APKs or production data. No server/infrastructure changes, no external writes, no APK build/install. `fcm_push` remains deferred.

## Verify, commit, push
- First run `./gradlew clean testReleaseUnitTest` in `canary-v4/android` (clean is mandatory; do not rely on UP-TO-DATE).
- Run `node --test test/server.test.mjs` in `canary-v4/server`.
- Run `git diff --check` at repo root.
- Inspect staged paths: no secrets/local config/APK/build artifacts/production data.
- Commit exactly: `TASK-001d: complete v4.1.1 probes`
- Push `origin/codex/task-001d-canary-v4`.

## Final report
List corrected blockers, files, exact test results, hash/push outcome. If any verification fails, stop without commit/push and report exact output.