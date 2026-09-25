# Task: Round 2B — WhatsApp-like composer and message bubbles

- **ID:** `UI-013B`
- **Status:** `accepted by Hermes — physical Android APK/IME check remains after round build`
- **Priority:** high
- **Depends on:** `UI-013A`

## Goal
Rework the offline chat composer and bubbles into the agreed WhatsApp-like visual structure, keeping all behavior local/in-memory.

## Allowed scope
- Modify only: `App.tsx`, `src/ui/types.ts`, `src/ui/demoData.ts`, `src/ui/state.ts` only where required for deterministic local message/call-event state; `__tests__/uiPreview.test.ts`.
- Do not add dependencies: Lucide is already present.

## Requirements

### Composer
- Remove separate left `+` button.
- One floating rounded capsule: left `Smile`, right `Paperclip` and `Camera`.
- `Camera` is visible only for whitespace-only/empty draft; hide for non-whitespace text.
- Separate circular right action: `Mic` for empty draft, `SendHorizontal` for non-empty; animate/transition the icon state.
- TextInput grows to 5–6 lines then scrolls internally.
- Composer floats over chat with 6–8 dp spacing, no white full-width strip/divider; honour IME and bottom gesture insets established in UI-013A.
- `SendHorizontal` appends trimmed local message then clears draft. `Mic`, attachment, smile and camera are visual mocks only: no permissions.

### Messages
- Own: right green bubble; receipt Lucide states `Check` (sent), `CheckCheck` (delivered), coloured `CheckCheck` (read).
- Other: left light bubble; first incoming message in a consecutive series has a tail.
- Small time inside every bubble bottom-right.
- Add a subtle generic pattern to chat background; no protected/copycat artwork.
- In-chat mock call events are distinct bubbles:
  - “Голосовой звонок · 1 мин”;
  - “Пропущенный звонок — нажмите, чтобы перезвонить” with red `PhoneMissed`.

## Test requirements
Extend `__tests__/uiPreview.test.ts` for:
- trimmed send still adds local outgoing message;
- empty draft does not add a message;
- whichever extracted pure helper(s) determine composer action/camera visibility and receipt/event state.
Do not add brittle snapshot tests if renderer setup does not support them.

## Non-goals
- No header/IME algorithm changes except smallest integration required from UI-013A.
- No call-screen or Calls-tab changes.
- No network/auth/real media/permissions/persistence.

## Acceptance criteria
- [ ] All requested composer/bubble/event visual states are implemented with Lucide-only actions.
- [ ] No standalone plus button, white strip, fixed keyboard height, emoji or textual action substitutes remain in composer.
- [ ] Local send and existing navigation remain working.
- [ ] Focused tests, lint, full test suite and typecheck pass.

## Verification
```bash
cd /root/projects/che-tam
npm run lint
npm test
npm run typecheck
```

## Manual APK check after Hermes build
1. Verify draft states: empty → Mic + Camera; typed text → SendHorizontal, Camera hidden.
2. Verify multiline growth and internal scrolling beyond 6 lines.
3. Send a message; inspect green bubble, time and receipt icon.
4. Inspect incoming tail, both event bubbles and background pattern.
5. Open keyboard and confirm UI-013A behavior remains intact.

## Constraints
- Make timestamped `.bak` backups before editing existing files.
- Never touch `.env`, secrets, Canary, Android build/signing, network or device capabilities.
- Do not commit/build/prebuild/run Gradle/emulator/device.
- Return changed paths, exact verification outcomes, limitations.
