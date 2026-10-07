# CRYPTO-001 — проверка libsodium-обёртки в Expo/React Native

- **Статус:** approved by Arslan, 2026-10-07. This is a compatibility proof, not message encryption or any server work.
- **Source:** ADR-004.
- **No fallback:** if an appropriate Expo/RN arm64-compatible libsodium wrapper cannot be proven on device/emulator, stop and report; do not invent crypto or substitute another primitive.

## Goal

Select and integrate a maintained React Native wrapper for libsodium compatible with current Expo/React Native Android arm64 release build. In localtest Settings add «Проверка шифрования». When tapped on a phone/emulator, run and display individual Russian `OK`/error results for:

1. X25519 key generation / compatible public-key operation;
2. Ed25519 detached sign + verify;
3. XChaCha20-Poly1305 encrypt + decrypt;
4. `crypto_box_seal` encrypt + `seal_open` decrypt;
5. `crypto_pwhash` Argon2id;
6. `crypto_secretstream_xchacha20poly1305` push + pull.

## Acceptance

- Use documented libsodium APIs and a real native/JS wrapper; no handcrafted crypto, `Math.random`, insecure fallbacks or custom protocol/envelope.
- Tests use published libsodium test vectors where available; property/roundtrip tests alone are not enough. If the wrapper’s API cannot expose a required primitive, it fails selection.
- The Settings checker must run actual primitives asynchronously on device/emulator, retain no key/password/plaintext after its run, and show no sensitive values in UI/logs/errors.
- A successful arm64 localtest APK demonstrates all six checks; errors identify only the check name and a safe error category.
- No real transport/server, device registration keys, message encryption, backup implementation, key persistence, or production endpoint is added by this task.

## Allowed scope

`package.json`, `package-lock.json`, Expo/native config only where package integration strictly requires it, minimal checker module under `src/crypto/**`, Settings UI, focused tests, this task file. No `spec.md`, ADRs, server/infrastructure, message/outbox protocol, secrets, builds/Gradle/prebuild, commit or push.

## Verification

Run focused tests, lint, full Jest, typecheck, and diff check. Report selected package/version, evidence for each primitive and exact rollout JSONL. Hermes will perform the native APK build and acceptance separately.