# TASK-001d-2J — Связка WebSocket-логов и диагностика закрытий (v4.0.5)

## Status
Approved by Arslan. Implement source and focused tests only. Do not run Gradle/build, deploy/restart services, install APK, commit, or push.

## Context
The completed server-log review found only `canary_ws_open` records with `deviceLabel: null` and no corresponding `canary_ws_close` records. The most likely field condition is a silent break on the phone-to-server path. v4.0.5 must correlate client journal events with server logs and make every observable server socket termination diagnosable. The server must not initiate WebSocket ping frames or implement a ping/pong liveness timeout: doing so would contaminate the idle-path experiment.

Existing uncommitted v4.0.5 light-run calibration changes are intentional and must be preserved; do not revert them.

## Scope
May modify only:
- `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryWebSocketKeeper.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/light/CanaryLightRunExecutor.kt` only if needed for common request correlation headers
- `canary-v4/android/app/src/main/java/net/hearth/canary/monitor/*` only if needed for journal context
- `canary-v4/android/app/src/test/java/net/hearth/canary/light/*`
- `canary-v4/server/src/websocket.mjs`
- `canary-v4/server/src/server.mjs` only if needed to log Canary HTTP device labels
- `canary-v4/server/test/*`
- `docs/tasks/TASK-001d-2J-ws-log-correlation-v405.md` only for task notes, if useful.

Do not change endpoint secrets, secret files, nginx/systemd/infrastructure, TLS pins, dependencies, build setup, package/version fields, or files outside repository. Never read/print/modify `.env*`, `secrets.properties`, keystores, or production data.

## Required behavior

### 1. Stable client WS correlation
- Persist a non-secret, installation-scoped `deviceLabel` already used by the application, with safe fallback `unknown` if unavailable.
- Generate a client `connectionId` UUID for each physical WebSocket creation, before upgrade.
- Pass both `deviceLabel` and client `connectionId` during WebSocket upgrade via explicit `X-Canary-Device-Label` and `X-Canary-Connection-Id` headers. Do not put labels or IDs in URLs.
- Client `ws_keepalive` uses this exact client connection ID in journal records.
- Preserve the persistent client WebSocket, `pingInterval(0)`, echo-only probe, and five-second probe timeout.

### 2. HTTP label correlation
- Every Canary HTTP request (controls and server request) carries `X-Canary-Device-Label`, with safe `unknown` fallback.
- The server logs Canary HTTP requests using a structured `canary_http_request` event with method, pathname, HTTP status, deviceLabel, timestamp. Never log request authorization/key material or raw headers.

### 3. Server WebSocket log lifecycle
- The server must prefer validated client `X-Canary-Connection-Id` / `X-Canary-Device-Label` for `canary_ws_open` and `canary_ws_close`. Both headers are strictly optional: legacy 4.0.4 WebSocket and HTTP requests without either header must continue to be accepted exactly as before (no rejection); log a server-generated ID for WebSocket and null label for missing/malformed headers.
- `canary_ws_open` logs connectionId, deviceLabel, timestamp.
- Exactly one `canary_ws_close` must be emitted for every opened socket when Node observes it, including: graceful client WebSocket close, remote TCP drop/error, and server-side socket close after proxy/Nginx closes the upstream connection.
- Close log fields: connectionId, deviceLabel, openedAt, timestamp, durationMs, closeCode (null if no WS close frame), reason (`client_close`, `remote_eof`, `socket_error`, `server_protocol_error`, or suitable similarly explicit enum), and lastReceivedAt.
- Avoid duplicate close records across `end`, `close`, and `error` events through a single idempotent finalize function.
- Preserve existing echo behavior and response to client ping with pong. Do not originate server pings, intervals, timers, or pong deadlines.

### 4. Tests
Add/update focused Node tests:
- a WS opened with valid client headers logs their exact client connection ID and label;
- a legacy HTTP Canary request without either header returns 200 and logs `deviceLabel: null`; a legacy WS upgrade without either header remains accepted and logs a server-generated connection ID and null label;
- graceful client close yields one close record with connection ID/label/code/duration;
- destroy/abrupt TCP client connection yields one close record with connection ID/label and a non-graceful reason;
- no server-initiated ping timer is introduced (test implementation behavior only if practical; code review clarity is enough otherwise);
- HTTP request with device label produces the sanitized structured server event.

Add/update focused Android JVM tests for request-header creation and client connection-ID consistency in emitted result, using pure helpers where Android runtime is unavailable.

## Constraints
- Do not run Gradle/build/adb/emulator/install.
- Do not execute production service actions, nginx changes, remote writes/uploads, commit, or push.
- You may run only focused Node tests for server code and `git diff --check`; report exact commands/results.
- Do not implement the broader hourly full-run/TURN/upload/nightly-export task in this slice.

## Final report
List modified files, focused tests and outcome, `git diff --check` result, and state clearly: no Gradle build, APK, deployment/restart, install, commit, or push.