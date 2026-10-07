# CRYPTO-001S — заменить sodium-обёртку после crash New Architecture

- **Статус:** approved by Arslan, 2026-10-07.
- **Причина:** v0.6.8 немедленно падает на телефоне: `sodium-react-native-direct` не совместим с включённой React Native New Architecture (`TurboModuleInteropUtils$ParsingException`).

## Verified upstream choice

Использовать **`react-native-libsodium@1.7.0`** от serenity-kit.

- README пакета, раздел **Requirements**, явно указывает: **“New Architecture enabled”**.
- README, раздел **Installation Expo (dev-client)**, документирует Expo plugin: `plugins: [["react-native-libsodium", {}]]`.
- Repository: `https://github.com/serenity-kit/react-native-libsodium`; package README inspected by Hermes on 2026-10-07.

## Required

1. Полностью удалить `sodium-react-native-direct`: dependency/lockfile, `react-native.config.js`, mock/declarations, прежние compatibility code/tests and every import/reference. Do not leave its package name in source or config.
2. Install and configure `react-native-libsodium@1.7.0` exactly per its README for Expo plugin. Do not change unrelated dependencies.
3. Bump release metadata consistently to `0.6.9` / Android `versionCode 10`: package, package-lock root, app.json and prebuilt Android Gradle. Update release config tests.
4. The crypto native import must be **lazy**: it must not be a static/transitive startup import. Load it only after user opens **Настройки → Проверка шифрования** and requests the check. A load failure must render a Russian safe error state on that screen and must not crash the app. Add a test that verifies this boundary without requiring native runtime.
5. Keep only supported required checks: X25519, Ed25519, XChaCha20-Poly1305, `crypto_box_seal`, Argon2id and **“Шифрование файла 5 МБ”** through `crypto_aead_xchacha20poly1305_ietf`. Remove secretstream from UI/tests/types/rollout. Do not create a substitute stream primitive.
6. Preserve no plaintext/key/password/code logging. No handwritten crypto; invoke only react-native-libsodium APIs.

## Scope exclusions

No server/network code. Do not change composer/scroll behavior from `833356f`. Do not run Gradle, prebuild or APK build. Do not commit/push. Do not edit unrelated existing untracked files.

## Checks

- Focused crypto and app UI/lazy-load tests.
- Full Jest, lint, typecheck, `git diff --check`.
- Give exact rollout JSONL and report docs evidence location quoted above.