# TASK-001d-4.1.4 — service reach journal and target modes

## Status
Approved by Arslan. Canary is frozen: implement **only** the corrections below. Do not refactor unrelated code or add functionality beyond this task.

## Required reading
Read `AGENTS.md`, `docs/spec.md`, this task, and current `CanaryServiceReach.kt`, `MainActivity.kt`, journal/export code, `CanaryMonitorService.kt`, models, and tests before editing.

## Required behavior

### 1. Persist manual and scheduled service checks
- Every result produced by manual UI action **«Проверить сервисы»** must be appended to the normal local journal as `testType=service_reach`, with one common generated `runId` for that button invocation.
- It must be exported by the existing journal export without special export code.
- Every daily scheduled full-run service check remains journaled as `service_reach` with the enclosing full-run `runId` (current expected pipeline must remain intact).
- Each persisted service-reach record must include: `service`, `host`, `port`, `protocol`, `mode`, `success`, `errorCategory`, `errorDetail`, `tcpMs`, `tlsMs`, `udpMs`, `certTrusted`, `runId`.
- Add deterministic JVM-level coverage that exercises the manual action’s persistence/coordinator boundary into an in-memory journal/DAO and checks that all service results appear in the resulting export records with one runId and all listed fields. Do not require Android UI instrumentation or real network.

### 2. Explicit check mode per target
Add/serialize a `mode` value to every service-reach result and journal record:
- `tls`: TCP then TLS using Android’s normal trust validation. Default.
- `tls_any_cert`: success iff the TLS handshake completes even when Android trust validation rejects the certificate. Set `certTrusted=false` in that case; `certTrusted=true` if normally trusted. Use for `1-courier.push.apple.com:5223`, `1-courier.push.apple.com:443`, and `chat.signal.org` (also in APNs reach where applicable).
- `tcp`: success iff TCP connect succeeds; do no TLS. Use for `g.whatsapp.net:443` and `g.whatsapp.net:5222`.
- `udp_stun`: STUN targets.

Do not weaken normal `tls`; its certificate validation behavior remains unchanged.

### 3. Literal IP and UDP error treatment
- When host is a literal IPv4/IPv6 address (including `149.154.167.50`), connect directly with no DNS lookup. Preserve its no-SNI policy.
- STUN timeout maps to `udp_timeout`; other STUN failures map to `udp_error`. Do not label UDP failures as TCP errors.
- Add enum wire values and focused deterministic tests.

### 4. Full run APNs parity
- Apply the same target mode/trust behavior to `apns_reach` in the full run. APNs courier targets must use `tls_any_cert`; serialized records include mode and `certTrusted`.

### 5. Version and verification
- Set `versionCode = 40104`, `versionName = "4.1.4"`.
- Update focused tests for inventory/modes, manual persistence/export boundary, normal TLS vs any-cert semantics, TCP mode no handshake, literal IP skips resolve, UDP categories, APNs mode parity, and journal serialization.
- Run `./gradlew testReleaseUnitTest` only. Do not run release build/assemble, sign, commit, push, install APK, access secrets, server configuration, production data, or external services.

## Scope restriction
Expected changes are Android implementation/models/journal/UI coordinator and focused JVM tests only. No server source, deployment, nginx, coturn, systemd, data files, secrets, signing configuration, generated outputs, or unrelated documentation.

## Final report
Changed files; exact unit-test outcome; concise explanation of manual journal persistence and `tls_any_cert` security boundary; state that no release build/deploy/commit/push occurred.
