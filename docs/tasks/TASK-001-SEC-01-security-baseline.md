# TASK-001-SEC-01: Обновить dependency baseline Canary

- **ID:** `TASK-001-SEC-01`
- **Status:** approved
- **Owner:** Hermes
- **Implementation agent:** Codex CLI
- **Base commit:** `3cf0c5b`

## Goal

Обновить Expo / React Native dependency baseline Android Canary до совместимого набора без `critical` и `high` уязвимостей в `npm audit --omit=dev`, не меняя пользовательское поведение или сетевую политику канарейки.

## Context

Текущий Expo SDK 51 dependency tree показывает 1 critical и 10 high advisory, включая direct `react-native` и transitively `tar`, Metro and Expo CLI dependencies. Это блокирует APK для родственника.

## Allowed scope

- `package.json`, `package-lock.json`
- Expo-generated compatibility config only if a dependency upgrade requires it: `app.json`, `babel.config.js`, `tsconfig.json`, `index.js`
- Source/test changes only when a real API compatibility break requires them
- `README.md`, `PROGRESS.md`, `BACKLOG.md`

## Must not change

- No infrastructure, nginx, TLS, DNS, systemd, firewall, endpoint URL, secrets, `.env`, native APK signing files, or files outside the worktree.
- No `npm audit fix --force`.
- No unrelated feature/refactor, no VPN/tunnel/UDP/TURN/LiveKit/Supabase, no external deployment.
- Preserve the adaptive cadence, pair-level failure recovery, manual throttle, local-only journal fields, and no-upload policy.

## Requirements

- Use Expo-supported dependency alignment: inspect the compatible current Expo SDK and apply explicit, minimal upgrades. Do not force incompatible versions through npm overrides unless an Expo compatibility check confirms the stack works.
- Regenerate `package-lock.json` from the final dependency set.
- Run `npx expo-doctor` and resolve issues caused by this update.
- Run `npm audit --omit=dev --json` and record the final vulnerability summary.
- Target must be exactly `critical: 0` and `high: 0` in runtime audit. Moderate/low advisories may remain only if documented with package and reason.
- Preserve all existing functionality and add/fix tests only for genuine compatibility changes.

## Acceptance criteria

- [ ] `npm ci` passes from the final lockfile.
- [ ] `npm run lint`, `npm test`, and `npm run typecheck` pass.
- [ ] `npx expo-doctor` passes or only reports a documented non-actionable warning unrelated to app compatibility.
- [ ] `npm audit --omit=dev --json` reports `critical: 0`, `high: 0`.
- [ ] No real endpoint, secret, or infrastructure change is introduced.
- [ ] Commit begins `TASK-001-SEC-01:`.

## Expected report

- Previous and final Expo, React Native, and relevant package versions.
- Files changed and commit SHA.
- Exact verification results including full runtime audit summary.
- Any remaining moderate/low advisory with direct/transitive path and rationale.
