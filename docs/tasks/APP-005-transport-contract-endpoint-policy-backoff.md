# APP-005 — transport contract, local endpoint policy, and retry math

- **Status:** approved
- **Depends on:** APP-004 (`1a80ee7`)
- **Implementation agent:** Fatima; Hermes owns review, verification, commit, and push.

## Goal

Introduce the client-side, **network-free** contract and deterministic local policy that future sync/outbox operations will use. Implement no production endpoints and make no actual network connection. This task models selection, endpoint-list ingestion through a fake source, DNS-result classification, byte accounting, persistence abstractions, and retry delays only.

## Requirements

### 1. Single transport contract

Create a narrow `src/transport/**` contract for future operations. It must expose request/response/error types and a `Transport` interface, but include no concrete HTTP/WS/fetch/socket implementation. All future networking can depend on this interface only.

- Transport calls must accept an availability signal or policy input and immediately return/throw an `offline` classification when unavailable, without invoking any supplied operation/attempt callback.
- No endpoint literal may be a production host, URL, IP address, or secret. Test fixtures use opaque IDs only.

### 2. Endpoint policy and persisted last-known-good

Create pure policy/repository modules under `src/transport/**` with narrow injectable async storage (in-memory fake in tests; AsyncStorage adapter is permitted only as a key/value persistence adapter, not by using or changing the existing Canary `src/storage.ts`).

- Endpoint records use opaque `id`, `priority`, and state only; no real addresses.
- Validate/update a list from an injected fake source. Reject duplicate IDs and invalid priorities without corrupting an already valid persisted list.
- Choose persisted `lastKnownGoodEndpointId` first if it is present in the approved current list and has not been explicitly marked unavailable; otherwise choose the lowest numerical priority, stable by `id`.
- A successful fake result marks an endpoint last-known-good; a failure can explicitly mark it unavailable and triggers selection of an eligible reserve. Persist/reload this state deterministically.
- No background refresh, polling, or real endpoint-list retrieval.

### 3. Result classification and byte counters

- Distinguish exactly these categories at the policy boundary: `offline`, `endpoint_failure`, `address_blocked`.
- `address_blocked` must be returned for DNS answers `127.0.0.1`, `0.0.0.0`, IPv6 loopback `::1`, unspecified `::`, and any injected explicit DNS-tampering signal. It must never be returned as `offline` or `endpoint_failure`.
- Maintain a local in-memory/persistable bytes counter keyed by opaque endpoint ID and direction (`sent` / `received`). Increment only when an explicit result provides non-negative byte counts. No actual measurements/network operations.

### 4. Backoff calculation only

- Implement a pure exponential backoff calculation with injected deterministic random/jitter source and a hard ceiling.
- Define constants in the new transport module: initial delay, multiplier, jitter range, max delay. Attempt number zero is valid; delays are bounded and non-negative.
- This task schedules no timer and performs no retry loop. It returns a next-delay value only.

### 5. Diagnostics view-model

- Provide a pure, Russian diagnostics view-model based only on policy state. It includes current connection category, opaque selected/last-known-good endpoint ID, byte counters, and next retry delay where applicable.
- Never display an address, URL, raw DNS response, secret, or technical exception text.
- Do not add a screen/UI in APP-005; test the view-model only.

## Focused tests

Add deterministic tests proving:

1. no transport attempt occurs when offline;
2. fake endpoint-list update validates/replaces only valid data; last-known-good survives repository reload and wins over lower-priority reserve until explicitly unavailable;
3. unavailable last-known-good falls back deterministically;
4. every loopback/unspecified/tampering DNS case is `address_blocked`, not `offline`;
5. byte counters correctly aggregate per opaque endpoint/direction;
6. backoff has deterministic jitter, non-negative bounded delays, grows/caps, and never creates a timer/busy loop;
7. Russian diagnostic model is safe and contains no address/raw DNS/exception disclosure;
8. no concrete HTTP/fetch/WS/socket/DNS lookup exists under new `src/transport/**` files.

## Constraints

- No actual HTTP/fetch/WebSocket/socket/DNS lookup, endpoint URL/address, server, FCM, foreground/background service, polling, retry timer, secrets, `.env`, package/lockfile, Android/iOS, Canary (`src/config.ts`, `src/storage.ts`, monitor/journal code, `canary-v4/**`), calls/media, APK/Gradle/build, commit, or push by Fatima.
- Only `src/transport/**`, narrowly scoped focused tests, and this task file may change. Do not change APP-004 UI/hook or existing modules.

## Verification

Fatima runs:

```bash
npm run lint
npm test
npm run typecheck
git diff --check
```

No APK build. Report files, exact outcomes, and explicit confirmation that no network-capable code exists.