# Task: Round 2D — WhatsApp-style Calls tab

- **ID:** `UI-013D`
- **Status:** `approved for implementation — UI-013C manually accepted by Arslan on 2026-09-25`
- **Priority:** medium
- **Depends on:** `UI-013C`

## Goal
Replace Calls demo cards with an offline WhatsApp-style call log and mock callback entry points.

## Allowed scope
- Modify only: `App.tsx`, `src/ui/types.ts`, `src/ui/demoData.ts`, `src/ui/state.ts` if a pure log-state helper is required, `__tests__/uiPreview.test.ts`.
- No dependency changes; use existing Lucide.

## Requirements
- Remove “Последний демо-звонок” and “Лестница соединения” cards.
- Render in-memory call log rows: avatar, name, direction icon, date/time and right callback action.
- Direction icons: `PhoneIncoming`, `PhoneOutgoing`, red `PhoneMissed` for missed.
- Right callback action uses `Phone` or `Video`; it opens the existing corresponding mock call screen only.
- Add a circular `PhonePlus` FAB bottom-right above bottom safe area with 48×48 dp minimum touch area and Russian accessibility label. It can open a minimal in-memory mock choice/state; no contacts permission or real calling.
- When log is empty, show exact text: “Здесь появятся ваши звонки”.
- All action icons are Lucide-only and all icon-only buttons have accessibility role/labels.

## Test requirements
Add pure-state tests for empty/non-empty log display model and callback type selection if helpers are extracted. Preserve all existing UI tests.

## Non-goals
- Do not change chat/composer/call-screen layout except wiring a mock callback to existing `startCall` state.
- No contacts, network, auth, real call integration, permissions, persistence or Android changes.

## Acceptance criteria
- [ ] Both demo cards are gone.
- [ ] Rows, direction colours/icons, dates/actions and accessible `PhonePlus` FAB match requirements.
- [ ] Exact empty-state text is rendered for an empty log.
- [ ] Callback/FAB behavior stays entirely in memory and no capability/permission API is imported.
- [ ] Lint, tests and typecheck pass.

## Verification
```bash
cd /root/projects/che-tam
npm run lint
npm test
npm run typecheck
```

## Manual APK check after Hermes build
1. Inspect log rows, incoming/outgoing/missed visual distinction and callback buttons.
2. Tap Phone/Video callback and ensure corresponding mock call opens; end returns normally.
3. Verify FAB stays above gesture bar.
4. Use empty demo state if exposed and verify exact empty text.

## Constraints
- Timestamped `.bak` before edits.
- Do not touch `.env`, secrets, Canary, Android build/signing or external services.
- No commit/build/prebuild/Gradle/emulator/device.
- Return changed paths, exact check results, limitations.
