#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# -gt 0 ]]; then
  case "$1" in
    /*) APK="$1" ;;
    *) APK="$ROOT_DIR/$1" ;;
  esac
else
  PACKAGE_VERSION="$(node -e "process.stdout.write(require(process.argv[1]).version)" "$ROOT_DIR/package.json")"
  APK="$ROOT_DIR/artifacts/che-tam-v${PACKAGE_VERSION}-localtest-arm64.apk"
fi
BUILD_APK="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"

mkdir -p "$(dirname "$APK")"

cd "$ROOT_DIR/android"
EXPO_PUBLIC_LOCAL_TEST_MODE=1 ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a

cp "$BUILD_APK" "$APK"
unzip -p "$APK" assets/app.config | grep -F '"EXPO_PUBLIC_LOCAL_TEST_MODE":"1"'

printf 'Localtest APK verified: %s\n' "$APK"
