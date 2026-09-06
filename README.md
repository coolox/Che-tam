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

This task configures the Android package as `net.hearth.canary` in `app.json`.

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

Records are retained for 21 days and capped at 6048 records, removing oldest records first. Export writes human-readable JSON for manual transfer only.

## Traffic Estimate

Normal scheduling is one HTTPS request plus one WebSocket connect/close every 10 minutes. Estimated traffic is 4320 KB/month, excluding manual exports and APK installation. Manual checks add about 1 KB each under the same small-response assumption.

## Expo Background Limitation

`expo-background-fetch` exposes a minimum interval request, not an exact timer. Android and device vendors may delay or suppress background checks depending on battery optimization, app standby, reboot state, and user settings. The participant instructions ask the tester to disable battery restrictions for this app.
