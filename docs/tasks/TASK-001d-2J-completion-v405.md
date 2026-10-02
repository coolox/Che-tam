# TASK-001d-2J-completion — Android correlation coverage for v4.0.5

## Status
Approved by Arslan under canonical plan `docs/tasks/TASK-001d-plan-405-410.md`. Implement **only** any remaining Android-side requirements of plan item 3 / TASK-001d-2J that are not already committed. This is distinct from production deployment, which Hermes performs after code acceptance.

## Required reading
Read `AGENTS.md`, canonical plan, `TASK-001d-2J-ws-log-correlation-v405.md`, current source and tests. Review current committed 2I/2J code first; do not duplicate features that exist.

## Required behavior
1. Verify every Canary HTTP request (controls and server request) uses explicit `X-Canary-Device-Label`; WS upgrade uses both `X-Canary-Device-Label` and client-generated `X-Canary-Connection-Id` UUID.
2. Add focused Android JVM tests for:
   - HTTP correlation header creation for both control and `http_domain` requests;
   - WS request carries safe label and exact generated client connection ID;
   - same physical WS retains that ID in `ws_keepalive` result helper; invalid/missing label follows safe fallback.
3. If any test exposes a real missing Android correlation behavior, make the smallest source correction in the existing light-run/keeper helper code. Do not change server code unless an actual contract mismatch requires it; server Node acceptance tests already exist and must remain green.
4. Preserve persistent WS, `pingInterval(0)`, echo-only probe and 5-second timeout. Headers remain optional server-side for legacy 4.0.4.

## Prohibitions
Do not work on 2K/2L/full run/TURN/upload/budget/nightly upload. Do not alter secrets, pins, signing/version/build setup, infrastructure, services, deployment, APK installation, or production data. Never read/print/write secret files.

## Verification and commit
- `./gradlew testReleaseUnitTest` in `canary-v4/android`.
- `node --test test/server.test.mjs` in `canary-v4/server`.
- `git diff --check` at repo root.
- Verify staged paths exclude secrets/local configuration/build artifacts/APKs.
- Commit exactly `TASK-001d-2J: verify Android correlation headers` and push to `origin/codex/task-001d-canary-v4`.

## Final report
Changed files, exact test results, hash/push outcome, and explicit statement that deploy/restart/build release were not performed.