#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK="${1:-"$ROOT_DIR/artifacts/che-tam-v0.6.6-localtest-arm64.apk"}"
BUILD_APK="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"

mkdir -p "$(dirname "$APK")"

cd "$ROOT_DIR/android"
EXPO_PUBLIC_LOCAL_TEST_MODE=1 ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a

cp "$BUILD_APK" "$APK"
unzip -p "$APK" assets/app.config | grep -F '"EXPO_PUBLIC_LOCAL_TEST_MODE":"1"'

printf 'Localtest APK verified: %s\n' "$APK"
