# Hearth Canary Foreground Monitor Implementation Plan

> **For Hermes:** Implement task-by-task with focused tests and review.

**Goal:** Replace best-effort background fetch with a visible Android foreground service that runs HTTPS and WSS probes every 10 minutes while the app is backgrounded, and persists those results into the same local Canary journal.

**Architecture:** A native Kotlin foreground service owns the exact 10-minute timer and posts a persistent notification. It performs both probes using the embedded endpoint, writes only the existing allowed fields into a private SharedPreferences queue, and React Native imports that queue into AsyncStorage on launch/foreground. The service stays visible and user-controllable; it is not hidden.

**Tech Stack:** Expo SDK 57 / React Native, Kotlin Android service, Android notification channel, private SharedPreferences, TypeScript journal storage.

---

### Task 1: Native service contract and Android declaration

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/java/net/hearth/canary/CanaryMonitorService.kt`
- Create: `android/app/src/main/java/net/hearth/canary/CanaryMonitorModule.kt`
- Modify: `android/app/src/main/java/net/hearth/canary/MainApplication.kt`

**Steps:**
1. Add `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, and `FOREGROUND_SERVICE_DATA_SYNC` permissions.
2. Declare an exported-false `dataSync` foreground service.
3. Create a low-importance notification channel with a persistent Russian status notification and explicit text that monitoring is active.
4. Implement start/stop/status module API and wire package registration.
5. Validate merged manifest and Kotlin compilation.

### Task 2: Native 10-minute HTTPS/WSS probes and local queue

**Files:**
- Modify: `CanaryMonitorService.kt`
- Create: `android/app/src/main/java/net/hearth/canary/CanaryProbe.kt`

**Steps:**
1. Add a deterministic 10-minute Handler timer that only runs while the foreground service is active.
2. Implement HTTPS GET with timeouts and WSS TLS handshake/connect/close against the embedded endpoint.
3. Store timestamp, pair key, type, success, HTTP status, latency, sanitized category and coarse transport only; do not store payload/IP/contact/location.
4. Queue completed pairs atomically in private SharedPreferences for React Native import.
5. Stop cleanly on explicit user action; never restart stealthily.

### Task 3: Import native records into existing journal and user controls

**Files:**
- Create: `src/nativeMonitor.ts`
- Modify: `src/storage.ts`
- Modify: `App.tsx`
- Modify: `src/types.ts` only if needed for typed native queue records

**Steps:**
1. Read and clear the native queue through the native module and append records to current AsyncStorage journal without duplicates.
2. Start monitoring after notification permission is granted; show visible status in Russian.
3. Add explicit Start/Stop monitoring control; default to off until the user turns it on, matching Android foreground-service policy.
4. On app active, import pending service records before calculating status.
5. Keep existing manual and foreground timer behavior without concurrent duplicate probes.

### Task 4: Tests, documentation, device verification

**Files:**
- Modify/create: `__tests__/nativeMonitor.test.ts`
- Modify: `docs/participant-instructions-ru.md`
- Modify: `README.md`

**Steps:**
1. Unit-test queue import/deduplication and native-record field validation.
2. Run `npm run lint`, `npm test`, `npm run typecheck`.
3. Assemble release APK.
4. Verify signature, embedded endpoint, manifest foreground-service declaration and APK integrity.
5. Install on physical device: grant notifications, activate monitoring, background app for 12–15 minutes, export journal and verify a new pair was recorded with the persistent notification visible.

**Risks / constraints:** Android foreground service has a permanent user-visible notification and nonzero battery use. Exact 10-minute cadence is practical while the FGS is active but can still be affected by device reboot, force-stop, user swipe/stop, vendor policy, or Android restrictions. We must test on the target phone before sending to Turkmenistan.
