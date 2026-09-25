# Task: Round 2A — chat layout, IME anchoring and header

- **ID:** `UI-013A`
- **Status:** `accepted by Hermes — physical Android APK IME check remains after round build`
- **Priority:** high
- **Depends on:** current UI Preview; supersedes the overlapping chat-layout part of `UI-009` for this round

## Goal
Fix Android chat resizing so the conversation stays bottom-anchored with the IME, and replace the conversation header actions with Lucide icons.

## Allowed scope
- Modify only: `App.tsx`; focused test(s) only if a feasible renderer-level assertion exists.
- Read only as needed: `AGENTS.md`, `docs/STATUS.md`, this file, `App.tsx`, `package.json`, relevant existing UI test.
- Do not modify `package.json` or lockfiles: `lucide-react-native`, `react-native-keyboard-controller`, safe-area stack already exist.

## Requirements

### IME and list
- Keep `KeyboardProvider` / `react-native-keyboard-controller` based strategy; no fixed keyboard heights.
- On Android, IME must reduce available conversation area. Composer stays directly above it.
- Keep latest message bottom-anchored immediately above composer; list must not slide under header when keyboard opens.
- Use an appropriate reversed/bottom-aligned list strategy for RN while keeping visual chronological order.
- On close, no blank bottom gap, jump or overlap.

### Header
- Replace the text back glyph with Lucide `ArrowLeft`.
- Replace text actions “Аудио” and “Видео” with `Phone` and `Video`.
- Add `EllipsisVertical` at right; for Preview it may be a no-op mock action.
- Subtitle must be one line: “в сети” or “был(а) в 21:26”; remove “локальный демо-чат”.
- Every icon-only button has `accessibilityRole="button"`, exact Russian `accessibilityLabel`, and minimum 48×48 dp touch area.
- Respect top and bottom safe-area insets.

## Non-goals
- Do not change bubbles, receipt states, chat pattern, composer visual composition, call screens, Calls tab, demo data/types unless absolutely required by TypeScript.
- No network/auth/permissions/real media/persistence.
- No emoji, text glyph, or custom SVG as action icons.

## Acceptance criteria
- [ ] Android IME behavior meets the listed bottom-anchor requirements in source and is listed for physical APK check.
- [ ] Header exclusively uses requested Lucide icons and non-wrapping presence text.
- [ ] Current local send, scrolling and hardware Back behavior are not regressed.
- [ ] `npm run lint`, `npm test`, `npm run typecheck` all pass.

## Verification
```bash
cd /root/projects/che-tam
npm run lint
npm test
npm run typecheck
```

## Manual APK check after Hermes build
1. Open a long chat, focus/close input repeatedly.
2. Confirm latest message is directly above composer; no message is hidden beneath header.
3. Confirm no blank gap after closing keyboard.
4. Verify all header icons and gesture/status-bar spacing.

## Constraints
- Make timestamped `.bak` backups before touching existing files.
- Never read/print/modify `.env`, secrets, sessions or Canary files.
- Do not commit, build, prebuild, run Gradle, emulator, or physical device.
- Return only changed paths, exact command outcomes, and risks/blockers.
