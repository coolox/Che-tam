# CRYPTO-001R — Android autolinking native sodium module

- **Status:** approved by Arslan, 2026-10-07. Follow-up acceptance blocker for CRYPTO-001.
- **Evidence:** v0.6.8 release APK bundled JS package but contains no sodium native library and generated Android autolinking JSON omits `sodium-react-native-direct`; therefore Settings checker would be unavailable on a real device.

## Required

Add the minimal project React Native configuration necessary to autolink `sodium-react-native-direct@0.4.4` on Android. It must register the package's existing Android module (`com.sodiumreactnative.SodiumReactNativePackage`) and use the package's existing `android/` directory. Do not write a native crypto wrapper, do not modify the dependency package, and do not substitute cryptography.

Add a deterministic configuration test proving the generated RN config includes this Android source directory, package import and package instance. Keep release config metadata checks intact.

## Scope

Only minimal root RN autolinking config, focused tests, this task file. No changes to crypto APIs, app UI, dependencies, Gradle project files, server/network/docs other than this task. No Gradle/APK/prebuild, commit or push.

## Verification

Focused test, full Jest, lint, typecheck and diff check. Return exact rollout JSONL. Hermes will rebuild and verify the APK contains `lib/arm64-v8a/*sodium*` and native linkage.