# Task: UI-014 — Android brand assets, launcher icon and splash screen

- **ID:** `UI-014`
- **Status:** `accepted by Hermes — 2026-09-25; static review PASS; Android build/cold-start verification pending Hermes`
- **Priority:** high
- **Depends on:** no UI dependency; do not start before the input-asset gate below is satisfied.

## Goal
Replace the temporary Android launcher icon, in-app branding assets, notification small icon and template splash screen with the approved «чё» speech-bubble identity.

## Input assets and gate

**Gate is satisfied.** Hermes downloaded the approved ChatGPT share image on 2026-09-25 into:

- `assets/brand/che-tam-cloud-foreground-source.png` — verified PNG/RGBA, 1333×1180, alpha present; SHA-256 `5ab6f645205aed3eed3d8b82d7195d3cf4f531440cf16bf122a8dc265593e36e`.

Use this checked-in source as the definitive foreground input. Preserve it unchanged; derive production assets from a copy. Do not re-download from the expiring ChatGPT URL.

The earlier flattened image references below are background-only references and must **not** be used:

- `/root/.hermes/cache/images/img_305852d1feac.jpg` — 1254×1254 JPEG, green-gradient composition;
- `/root/.hermes/cache/images/img_6d54ea0d7e0f.jpg` — 1280×1133 JPEG, black-background bubble reference.

They are flattened JPEG/RGB files with **no alpha channel**. The glass bubble, glow and shadow are composited with the backgrounds, so they are not a production-safe adaptive-icon foreground source.

Do not use automated background removal or an approximate cutout of either JPEG as a final asset. It would leave baked green/black halos and incorrect glass transparency.

## Required deliverable assets

Once the input gate is passed, create source assets under `assets/brand/` (or another clearly named project-local asset directory) and produce Android resources from those sources:

1. **Launcher/adaptive icon**
   - Background: green gradient from the approved art; a flat `#0F5C48` background is acceptable only when the gradient cannot survive the Android resource pipeline.
   - Foreground: transparent cloud + «чё», centered within Android adaptive-icon safe zone: visual cloud fits the central **66%** of the 108×108 dp viewport so round/squircle masks never crop the cloud or tail.
   - Use Android adaptive-icon XML (`mipmap-anydpi-v26`) and generated density variants (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`). Preserve a legacy launcher icon for API <26.
   - Produce an additional store-ready, lossless **512×512 PNG** from the approved artwork. Do not put it inside the APK unless the project convention requires it.

2. **Android 13+ monochrome adaptive icon**
   - Provide `android:monochrome` as a single-color cloud + «чё» silhouette on transparent background.
   - It must be an actual one-color drawable/vector/alpha asset, not the color icon recolored by the launcher.

3. **Notification small icon**
   - Provide a dedicated white cloud silhouette on a transparent background for Android notifications.
   - Use a notification-safe alpha-only/white drawable with no green rectangular background and no colour icon.
   - Wire it only through the existing notification implementation/configuration; do not change notification permissions, monitoring behavior or Canary schema.

4. **In-app logo**
   - Replace every old/logo placeholder occurrence in the home header near «Чё-Там», the «О приложении» section and any visible in-app logo presentation with the approved coloured brand mark.
   - Respect existing safe-area/layout rules. Do not replace UI icons with non-Lucid assets: the logo is a brand image, all functional interface icons remain `lucide-react-native`.

5. **Native Android splash**
   - Implement AndroidX Splash Screen API using `androidx.core:core-splashscreen`; ensure it supports old Android versions through the library.
   - Apply `installSplashScreen()` in the native Android activity before React initialization, using the project’s native language/style.
   - Configure the launch theme with `windowSplashScreenBackground` = `#0F5C48` and center the approved cloud + «чё» mark using `windowSplashScreenAnimatedIcon` (or the compatible AndroidX equivalent).
   - Ensure the post-splash theme also has a dark-green window background. There must be no white frame/flash before, during or immediately after the splash.
   - Remove/replace the current `splashscreen_logo` template composition with the approved mark; no gray grid/circles remain.
   - No artificial timeout or hold. The splash exits as soon as the application is ready; use only the platform handoff/fade.

## Allowed scope after the input gate

- `assets/brand/**` and app asset configuration such as `app.json` where required;
- Android application resources under `android/app/src/main/res/**` for launcher, adaptive, monochrome, notification and splash assets/themes;
- `android/app/src/main/AndroidManifest.xml` and native activity/build files only where required for AndroidX Splash Screen installation;
- `App.tsx` and/or directly relevant UI components for in-app logo replacements;
- focused tests only if JS-level logo rendering has testable behavior.

## Strict non-goals

- No real network/auth/WebRTC/camera/microphone integration.
- No changes to Canary sources or native Canary behavior: `src/nativeMonitor.ts`, `src/storage.ts`, `src/exportJournal.ts`, `src/schedulePolicy.ts`, `src/types.ts`, and existing native monitoring code are out of scope.
- No Gradle/APK build, prebuild, emulator or physical-device run by Fatima.
- No dependency upgrades, unrelated permissions, app renaming, package-name changes or generated build artifacts.

## Implementation constraints

- Before editing each existing file, make a timestamped `.bak` copy beside it.
- Preserve the existing `adjustResize` and safe-area behavior.
- Functional icons throughout the app remain Lucide-only. The brand asset exception applies only to the logo/icon/splash/notification graphic described above.
- Do not claim actual Android Studio Image Asset UI usage is required: equivalent checked-in Android resource output is acceptable, but resource names/references must match the final manifest/theme.

## Acceptance criteria

- [ ] The installed launcher uses the approved adaptive icon, with cloud safely within the central 66% visual zone.
- [ ] API 26+ has adaptive foreground/background resources; API 33+ has a true one-colour monochrome resource; legacy density resources exist.
- [ ] A verified 512×512 PNG store asset exists.
- [ ] Android notification small-icon resource is a transparent, white cloud silhouette and is correctly referenced by existing notification code/config.
- [ ] Home header, About section and all other current in-app logo uses show the approved coloured logo.
- [ ] The native launch theme uses AndroidX Splash Screen API, dark-green `#0F5C48` background, centered approved mark, correct post-splash theme, and no template grid/circles.
- [ ] No intentional delay is added.
- [ ] No forbidden Canary/native-monitor changes or new capability/permission behavior.
- [ ] Lint, tests and typecheck pass.

## Verification Fatima must run (after gate)

```bash
cd /root/projects/che-tam
npm run lint
npm test
npm run typecheck
```

Fatima must also report exact created resource paths and inspect these static facts in the sources:

- launcher/adaptive/monochrome XML references resolve to existing resources;
- splash theme contains `windowSplashScreenBackground` `#0F5C48`, splash icon and a post-splash theme;
- native activity calls `installSplashScreen()` before React activity setup;
- notification icon reference resolves to a white/transparent drawable;
- the store PNG reports 512×512.

## Hermes-only follow-up after acceptance

Hermes builds and signs the APK, then performs an Android emulator/device launch test from a cold start to visually verify: no white flash, no template splash, safe masking of launcher icon, themed icon, and notification small-icon rendering.
