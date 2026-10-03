# APP-004 — connection state model and chat banner

- **Status:** approved
- **Depends on:** APP-003a (`ec7cc7c`)
- **Implementation agent:** Fatima; Hermes owns review, verification, commit, and push.

## Goal

Add a local, deterministic connection-state machine and an accessible Russian status banner in the existing open-chat header. This is UI/state preparation only: it has no production transport, endpoints, server, HTTP, WebSocket, polling, FCM, retries that issue network requests, or APK build.

## Requirements

### 1. Pure state model

Create `src/transport/connectionState.ts` with:

- `ConnectionStatus`: exactly `offline | connecting | online | degraded | retrying`.
- pure reducer/events with deterministic transitions, including at minimum: initial network observation, network lost/restored, connection started, connection succeeded, recoverable connection failure, retry scheduled, retry started.
- policy that offline always dominates: no transport failure must turn a currently offline state into `degraded` or `retrying`; network restore enters `connecting` (not directly online); only explicit successful connection enters `online`.
- Russian, stable, nontechnical presentation for every status:
  - `offline` → `Нет сети`
  - `connecting` → `Восстанавливаем связь`
  - `online` → `На связи`
  - `degraded` → `Связь нестабильна`
  - `retrying` → `Пробуем восстановить связь`
- an accessible view-model helper supplying both visible text and a Russian accessibility label. Do not expose URLs, exception messages, DNS detail, or internal error codes.

### 2. Narrow NetInfo hook adapter

Create `src/hooks/useConnectionStatus.ts` (or equally narrow location) that accepts an injectable network-source interface for tests. Production adapter may use the already installed `@react-native-community/netinfo` listener solely to observe availability. It must:

- dispatch only initial/changed network availability into the pure model;
- subscribe once and clean up exactly once on unmount;
- make no HTTP/WS/socket/DNS request and no timer-based retry;
- start from a safe non-online state until a real network observation arrives;
- expose only the current presentation/status necessary to render the banner.

### 3. Existing chat UI wiring

- In `PreviewAppShell`, retain existing navigation/theme/layout. Wire the banner **only** into the header of the open conversation.
- The banner must visibly render the Russian state text, have `accessibilityRole="text"`, and a stable Russian accessibility label from the presentation helper; use `accessibilityLiveRegion="polite"` where supported.
- Do not fake an actual transport connection. With online network availability the local presentation may enter `connecting`; only test-controlled explicit success may demonstrate `online` in state tests. The actual UI must never claim an unsupported server/transport connection succeeded.
- Offline local chats and messages remain usable; no changes to composer send behavior.

## Focused tests

Add tests proving:

1. all reducer transitions above and offline dominance;
2. exact Russian visible/accessibility presentation for each state;
3. injected NetInfo source initial availability/change subscription and cleanup, with no network request abstraction;
4. UI source/wiring exposes the banner only in Conversation, uses its accessible text contract, and does not add HTTP/WS/socket/fetch/endpoint strings.

## Constraints

- No real endpoint, production transport, HTTP, WebSocket, socket, DNS lookup, FCM, polling, timer/backoff, server, secrets, `.env`, package/lockfile, Android/iOS, Canary, calls/media changes, Gradle, build, APK, commit, or push by Fatima.
- May change/create only `src/transport/**`, `src/hooks/**`, minimal `src/app/PreviewAppShell.tsx` wiring/styles, and focused `__tests__/**`.
- Do not modify existing local SQLite, phone verification, demo seed logic, Android/native configuration, or project specification.

## Verification

Fatima runs:

```bash
npm run lint
npm test
npm run typecheck
git diff --check
```

No APK build. Report files, exact results, and no-network confirmation.