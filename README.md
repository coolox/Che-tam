# Hearth Canary

Minimal Expo + TypeScript Android canary for TASK-001. The app performs one HTTPS health request and one WebSocket connect/close check, stores only local journal records, and lets the operator export a JSON file manually.

## Configuration

Set the endpoint at build or runtime through `EXPO_PUBLIC_CANARY_ENDPOINT`:

```bash
EXPO_PUBLIC_CANARY_ENDPOINT=https://example.invalid/hearth-canary/ npm start
```

The repository contains only a placeholder in `.env.example`. Do not commit `.env` or real endpoints.

## Verification

Hermes verification commands:

```bash
npm ci
npm run lint
npm test
```

For local mock verification, run a local HTTPS endpoint that returns a small 2xx response at `/hearth-canary/` and accepts a WebSocket upgrade at the same path, then start the app with the mock URL in `EXPO_PUBLIC_CANARY_ENDPOINT`. Press `Проверить сейчас`; the local journal should receive one `https` and one `websocket` record.

## Android Build

This task configures the Android package in `app.json`.

Operator build options:

```bash
npm ci
EXPO_PUBLIC_CANARY_ENDPOINT=https://example.invalid/hearth-canary/ npx expo prebuild --platform android
cd android
./gradlew assembleDebug
```

The resulting debug APK is produced under `android/app/build/outputs/apk/debug/`. A production-quality APK can also be produced through EAS Build using the same public config variable.

## Journal Fields

The local journal stores only:

- `timestampUtc`
- `testType`
- `success`
- `httpStatus` where applicable
- `latencyMs`
- `networkType`
- `errorCategory`

Records are retained for 21 days and capped at 12096 records, removing oldest records first. That cap is sized for the worst expected mix of adaptive scheduled checks plus throttled manual rechecks. Export writes human-readable JSON for manual transfer only.

## Traffic Estimate

Planning estimate only: the app can produce one HTTPS + one WebSocket pair every 10 minutes for the first 24 hours, then one pair per hour, with failed pairs temporarily returning to the 10-minute cadence for 60 minutes. Manual rechecks are limited to one pair per 10 minutes. Monthly KB must be measured against the deployed HTTPS/WSS endpoint after infrastructure is in place, because TLS and WebSocket handshake overhead make local payload-only estimates incomplete.

## Expo Background Limitation

`expo-background-fetch` exposes a minimum interval request, not an exact timer. Android and device vendors may delay or suppress background checks depending on battery optimization, reboot state, app standby, force-stop behavior, and user settings. The participant should open the app at least once daily and use `Проверить сейчас` if the latest record is stale.
