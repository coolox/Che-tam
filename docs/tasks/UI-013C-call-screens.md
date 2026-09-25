# Task: Round 2C — video and audio call mock screens

- **ID:** `UI-013C`
- **Status:** `accepted by Hermes — 2026-09-25; final independent review PASS; lint/Jest 7 suites (31 tests)/typecheck PASS; no emulator/device or APK build in this task`
- **Priority:** high
- **Depends on:** `UI-013B`; retain safe-area behavior from `UI-013A`

## Goal
Polish the mock video/audio call screens into the approved layout without introducing real calling, camera, microphone, permission or network capabilities.

## Allowed scope
- Modify only: `App.tsx`; focused test(s) only if a pure call-state helper is extracted into `src/ui/state.ts` and tested in `__tests__/uiPreview.test.ts`.
- Existing Lucide dependency only. No dependency changes.

## Video requirements
- Contact name appears only once: upper overlay with “Вызов…” before mock connection, timer after.
- Remove centre duplicate name, technical `back` text, and dark diagonal corners.
- Before remote mock video: blurred contact avatar background, otherwise avatar-colour gradient.
- Connected remote view fills screen; self PiP has ~16 dp corners, subtle shadow, no thick white border.
- With mock camera off, PiP shows own avatar and `VideoOff`; never “Вы” text.
- Preserve draggable PiP and tap-to-hide controls; no invisible controls intercept touches.
- All bottom controls remain Lucide and clear bottom gesture inset.

## Audio requirements
- Full-screen blurred/darkened contact avatar background or avatar-colour gradient.
- Avatar, name and status occupy upper third.
- Status flow is mock-only: “Вызов…” → “Соединение…” → timer after mock answer. Remove “Исходящий аудиозвонок”.
- Move controls to bottom panel above gesture inset: circular `Mic`, `Ear`/`Volume2`, `PhoneOff`.
- Do not show video-only controls in audio mode.

## Non-goals
- No change to Calls tab/log or conversation composer/bubbles.
- No media permissions, camera/mic/WebRTC/LiveKit/network/backend.
- Do not change Android setup, package ID, signing, dependencies, Canary.

## Acceptance criteria
- [ ] Video and audio mock states exactly follow requested copy/layout rules.
- [ ] No technical “back” or “Вы” leaks remain.
- [ ] Video PiP and all controls stay within safe areas; audio controls are bottom-panel only.
- [ ] Existing end-call/back flow works and does not exit APK.
- [ ] Lint, tests and typecheck pass.

## Verification
```bash
cd /root/projects/che-tam
npm run lint
npm test
npm run typecheck
```

## Manual APK check after Hermes build
1. Video: confirm only top name/status; check blur/gradient, PiP drag and camera-off appearance.
2. Audio: check upper-third content, status transitions and bottom controls on gesture navigation.
3. Toggle all mock controls and end both calls; confirm return to chat.

## Constraints
- Timestamped `.bak` before changing existing file.
- Never touch secrets, Canary, Android build config or external systems.
- No commit/build/prebuild/Gradle/emulator/device.
- Return concise changed paths, exact checks, limitations.
