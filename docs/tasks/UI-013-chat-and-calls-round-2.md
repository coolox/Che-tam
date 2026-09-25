# Task: UI Preview — раунд 2: чат, звонки и журнал звонков

- **ID:** `UI-013`
- **Status:** `backlog — intake from manual APK testing; do not delegate until Arslan explicitly approves implementation`
- **Priority:** high
- **Source:** direct feedback from Arslan, round 2
- **Depends on:** current UI Preview and prior keyboard/inset/call tasks (`UI-009`, `UI-011`, `UI-012`)

## Scope boundary

This remains an **offline UI Preview**. Use fictional in-memory data only. Do not add network/auth/backend, WebRTC/LiveKit, real camera/microphone access, permissions, media capture, persistence, or device integrations. Do not touch Canary files, Android package/signing settings, `.env`, secrets, or external services.

All action icons must come **only** from `lucide-react-native`: no emoji, Unicode substitutes, or custom SVG icons.

All screens must honour top status-bar and bottom gesture insets. A bottom control, composer, or call-control button must never sit under the gesture bar.

## A. Conversation: keyboard and message list

### Problem
When the Android keyboard opens, messages move upward under the header and a blank gap remains above the composer.

### Desired behavior

- The conversation remains bottom-anchored: the latest message is immediately above the composer.
- Opening IME reduces the usable list height from below; it must not overlay the composer/list or push content beneath the header.
- Use the existing approved IME-inset approach (`react-native-keyboard-controller` / Android resize strategy) rather than a hard-coded keyboard height.
- Use a bottom-aligned/reversed message list strategy where appropriate (`reverseLayout` / `stackFromEnd` equivalent for React Native) and preserve natural message order on screen.
- Composer remains visible; no residual blank area, jump, or overlap when the keyboard closes.

## B. Conversation header

- Replace back arrow with Lucide `ArrowLeft`.
- Replace textual “Аудио” and “Видео” actions with icon-only `Phone` and `Video`.
- Add an icon-only `EllipsisVertical` action on the right.
- Replace wrapping caption “локальный демо-чат” with one-line presence text: either “в сети” or “был(а) в 21:26”.
- Every icon-only control: minimum 48×48 dp touch target and an accurate `accessibilityLabel`.

## C. WhatsApp-like composer

- Remove the separate left `+` button.
- Create one rounded full-width floating composer capsule with:
  - left: `Smile`;
  - right: `Paperclip` and `Camera`;
  - hide `Camera` while non-whitespace text is entered.
- To the right of capsule: separate circular action button:
  - empty/whitespace-only composer: `Mic` (mock hold-to-record affordance only; no real microphone);
  - non-empty composer: `SendHorizontal`;
  - animate the icon/state change.
- Text input grows to 5–6 lines, then scrolls internally.
- Composer capsule and circular action float over chat background with 6–8 dp visual spacing. No white full-width strip or separator line.
- Sending trimmed non-empty local text still appends an in-memory outgoing message and clears input.

## D. Conversation bubbles and call events

- Outgoing messages: right-aligned green bubble with a receipt state using Lucide:
  - `Check` = sent;
  - `CheckCheck` = delivered;
  - coloured `CheckCheck` = read.
- Incoming messages: left-aligned light bubble. First incoming bubble in a contiguous series has a visible tail.
- Time is small and inside each bubble at bottom-right.
- Replace plain chat background with a subtle, unobtrusive pattern; do not use competitor branding/assets.
- Render call events as distinct in-chat system bubbles:
  - “Голосовой звонок · 1 мин”;
  - “Пропущенный звонок — нажмите, чтобы перезвонить”, including red `PhoneMissed`.
- Mock actions can navigate/change in-memory UI state only.

## E. Video call UI

- Show the contact name only in the upper overlay, together with call timer/state. Remove duplicated centre name.
- Remove technical “back” text from beneath the name and self-video UI.
- Remove dark diagonal background corners.
- Before remote video exists: use a blurred contact avatar as background, or an avatar-colour gradient if no photo exists.
- Self PiP:
  - no thick white border;
  - about 16 dp radius and subtle shadow;
  - if mock camera is disabled, show own avatar plus `VideoOff`, never the text “Вы”.
- Preserve existing mock-only restriction and current controls; all controls remain Lucide and in safe area.

## F. Audio call UI

- Move controls from screen centre to a bottom panel matching video-call visual language, above gesture inset:
  - circular `Mic`, `Ear`/`Volume2`, `PhoneOff`.
- Full-screen background: blurred/darkened contact avatar photo, or avatar-colour gradient when unavailable.
- Place avatar, name, and status in the upper third.
- Status copy sequence: “Вызов…” → “Соединение…” → timer after mock answer. Remove “Исходящий аудиозвонок”.

## G. Calls tab: WhatsApp-style call log

- Remove demo cards “Последний демо-звонок” and “Лестница соединения”.
- Render an in-memory call log. Every row contains avatar, name, direction icon and date/time; use:
  - `PhoneIncoming`;
  - `PhoneOutgoing`;
  - red `PhoneMissed` for missed;
  - right-side callback button `Phone` or `Video`.
- Add bottom-right circular floating action button `PhonePlus`, positioned above bottom safe area.
- If the log is empty, show: “Здесь появятся ваши звонки”.
- Callbacks and FAB are mock navigation/state only; no actual calls or permissions.

## Allowed scope for implementation (confirm exact names after inspecting current UI structure)

- UI Preview source files currently owning conversation, composer, call screens, calls tab, demo data, tokens/styles;
- focused Jest/renderer tests for the changed state and structure;
- `package.json`/lockfile only if Lucide or the already-approved keyboard library is genuinely absent (first inspect existing dependencies; no upgrades/refactors).

## Explicitly do not touch

- Canary: `src/nativeMonitor.ts`, `src/storage.ts`, `src/exportJournal.ts`, `src/schedulePolicy.ts`, `src/types.ts`, Android native Canary code;
- real network/auth/camera/microphone/media/permissions/WebRTC;
- Android package ID, signing, build configuration, `.env`, credentials, sessions, secrets;
- unrelated UI, broad dependency updates, generated-file churn.

## Acceptance criteria

- [ ] All seven sections A–G above are implemented in offline preview scope.
- [ ] All UI icons are from `lucide-react-native`; no emoji/text/custom SVG action substitutes.
- [ ] Conversation keyboard layout is bottom-anchored and avoids header overlap/blank composer gap by implementation and manual device verification.
- [ ] Composer and all lower controls respect keyboard and gesture insets.
- [ ] Existing local send/navigation/back behavior remains correct.
- [ ] No real device capability, permission, networking or persistence code is added.
- [ ] Focused tests cover, where infrastructure permits: composer state/action switch, trimmed local send, camera visibility rule, call log empty/non-empty states, receipt/event rendering, and screen navigation states.
- [ ] `npm run lint`, `npm test`, and `npm run typecheck` pass.
- [ ] Fatima does **not** run `expo prebuild`, Gradle, APK build, emulator, or device. Hermes performs build/artifact verification only after code review and explicit user approval.

## Manual APK retest checklist (Arslan)

1. Open a long chat; open/close keyboard repeatedly and verify latest message sits directly above composer, with no header overlap or blank gap.
2. Enter 1–6 lines, then more than 6; verify growth, internal scroll, `Camera` hide/show and Mic/Send animation.
3. Send text and inspect outgoing green bubble, time, receipt icons; inspect incoming-series tail and call-event bubbles.
4. Check header actions, presence line, icon hit targets and all gesture-area spacing.
5. Open video call: no duplicated name/“back”/dark corners; inspect blur/gradient and PiP camera-off state.
6. Open audio call: avatar/status upper third, full-screen background, bottom safe-area controls and status transitions.
7. Open Calls: inspect realistic log rows, missed-call red icon, callbacks, `PhonePlus`, and empty state if available.

## Constraints for Fatima once approved

- Make timestamped `.bak` copies of every existing file before editing.
- Read `AGENTS.md`, `docs/STATUS.md`, this task file, relevant current UI source, and the current dependency manifest before editing.
- State expected changed paths and assumptions first.
- Do not commit, build, prebuild, start long-lived processes, or restart services.
- Return changed paths and exact lint/test/typecheck outcomes, plus limitations.
