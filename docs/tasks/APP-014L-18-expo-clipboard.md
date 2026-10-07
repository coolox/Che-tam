# APP-014L-18 — expo-clipboard boundary completion

- **Статус:** approved by Arslan, 2026-10-07. APP-014L-17 accepted as `5cb95dc`.
- **Граница:** focused local dependency correctness task; no APK/Gradle/prebuild, no server/network/ADR-002/bots/secrets/build scripts, no commit/push.

## Goal

Finish and verify migration from deprecated `Clipboard` in `react-native` to official `expo-clipboard` for Copy message.

## Requirements

1. No source import/use of `Clipboard` from `react-native` remains. Copy uses `expo-clipboard.setStringAsync` through testable app boundary.
2. Dynamic import is allowed only if necessary for Jest/native boundary; native runtime must invoke official module and errors must not crash/leave actions modal unexpectedly. Preserve dependency injection used by ConversationScreen tests.
3. Verify Expo package versions are compatible with installed Expo SDK using bundled native modules source. Keep only needed `expo-clipboard`; `expo-haptics` belongs to task 16 and must not be removed.
4. Add focused tests proving writer invokes async expo boundary, action menu copy success closes menu, copy failure is handled predictably/accessibly. Tests must not import a mocked deprecated React Native Clipboard.
5. Update task plan entry APP-014L-18 in `docs/tasks/APP-PLAN-phase1-3.md` only minimally to reflect implemented official package and verified behavior.

## Allowed

`src/app/clipboard.ts`, minimal ConversationScreen/state if required, targeted tests, `package.json`/lock if correction needed, `docs/tasks/APP-PLAN-phase1-3.md`, this task file. All other coordinator dirty docs off limits.

## Checks

Targeted + lint, full Jest, typecheck, diff check. Report exact rollout JSONL; do not commit/push/build.