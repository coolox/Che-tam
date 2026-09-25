# Task: UI Preview — раунд 4: единая навигация, списки и нижнее меню

- **ID:** `UI-017`
- **Status:** `accepted — manually verified by Arslan in APK che-tam-v0.5.2-round-4-arm64.apk on 2026-09-25`
- **Priority:** high
- **Source:** direct manual APK feedback from Arslan, round 4
- **Depends on:** current UI-013A–D, UI-014, UI-015 and UI-016 dirty-worktree implementation; preserve all unrelated work.

## Goal

Bring the offline UI Preview navigation to one consistent «Чё-Там» visual system: a shared branded header on every top-level tab, full-width Calls/Family lists, no Calls FAB, and an icon-first WhatsApp-like bottom navigation.

## Scope boundary

This remains an **offline in-memory UI Preview**. No server/auth/network/WebRTC/LiveKit, real calls/camera/microphone/contacts, permissions, persistence, notifications, analytics, Android/native/build configuration, app assets, dependencies, `.env`, secrets or external services.

All functional icons must come **only** from `lucide-react-native`. No emoji, Unicode substitutes or custom SVG icons.

## Allowed paths

- `App.tsx`
- `src/ui/state.ts` only for small pure display/count helpers if genuinely useful
- `__tests__/uiPreview.test.ts` for focused pure helpers/state tests
- this task file only for a factual implementation note

## Protected paths

Do not touch Android/native files, `app.json`, `assets/**`, packages/lockfiles, APKs, Canary files (`src/nativeMonitor.ts`, `src/storage.ts`, `src/exportJournal.ts`, `src/schedulePolicy.ts`, `src/types.ts`), or unrelated call/conversation UI.

## Requirements

### A. Shared top-level header

- Apply the same normal header layout to **Chats, Calls, Family and Settings**.
- Normal header: left transparent cloud-only `BRAND_MARK` image, then title `Чё-Там`, then a one-line tab subtitle; right `Search` icon-only action.
- Subtitles exactly: Chats — `Семейные разговоры`; Calls — `Звонки`; Family — `Семья`; Settings — `Настройки`.
- Use the current header/search transition only for Chats. On Calls/Family/Settings, Search may be safe in-memory no-op; it must remain a 48×48 dp accessible button and must not open network/capability UI.
- Remove top-level large section headings `Звонки`, `Семья`, `Настройки` from content.
- Header has no bottom divider. Its background matches surrounding list/content background. Same height, inset geometry and title/logo alignment across all four tabs.

### B. Cloud-only header mark

- Do not use `STORE_ICON` in a top-level header. Use only `BRAND_MARK` (transparent cloud + «чё»).
- Header mark about 48 dp high/wide, no square/green backdrop, no cropping; preserve its own soft glow.
- 16 dp left inset; 12 dp gap to title/subtitle; vertically center cloud against the text block.

### C. Calls and Family as full-width lists

- Calls: no card border, radius, outer card gaps or standalone title. Render full-width pressable rows matching the existing Chats row geometry (avatar, padding, typography, full-row pressed/ripple-like feedback).
- Call row: avatar; name; second line direction `PhoneIncoming`/`PhoneOutgoing`/`PhoneMissed` plus formatted date/time; missed direction and date red; right 48 dp callback `Phone` or `Video` with Russian accessibility label. Existing callback opens only the mock call state.
- Remove Calls `PhonePlus` FAB and its new-call choice panel entirely.
- Family: no cards/title. Render full-width pressable rows matching Chat rows: avatar, name, city/note subtitle, right 48 dp `Phone` and `Video` mock call buttons with Russian accessibility labels.
- The self row (`Айгуль М.`, `Вы · Турция`) remains first and visually separated from other family rows by restrained spacing or a subtle section break, not a card/container.
- Long press enables the same **visual selection behavior** as Chats: full-width soft-green selection fill and Lucide `Check` overlay on avatar; taps toggle rows; Back/ArrowLeft cancels. Actions may be no-op in memory. It must not affect real data or permissions.

### D. Bottom navigation

- Each tab has a Lucide icon above its label: Chats `MessageCircle`; Calls `Phone`; Family `Users`; Settings `Settings`, all 24 dp.
- Active tab: icon inside a fully rounded light-green capsule about 64×32 dp; icon + bold label dark green; animate capsule movement/appearance using existing React Native `Animated` only.
- Inactive tab: gray icon and label, no capsule. Remove old text underline/indicator.
- Place navigation above gesture inset, preserving a thin top separator or subtle shadow.
- Add a small green numeric badge at icon top-right: total unread count for Chats; missed-call count for Calls; no badges for Family/Settings. Counts use current in-memory data only.
- All tab controls have appropriate `accessibilityRole="tab"`, selected state, Russian label and at least 48×48 dp touch target.

## Tests

Add focused pure/state tests where renderer tests are infeasible:
- total unread Chats count from current demo chats;
- missed Calls count from current call log;
- family selection transitions: start, add/toggle, clear/cancel;
- preserve existing tests.

## Acceptance criteria

- [ ] All normal top-level tabs use one header system, exact subtitles, cloud-only 48 dp mark, Search action and no divider.
- [ ] Old separate content titles and old Calls/Family cards are removed.
- [ ] Calls/Families use full-width consistent rows, safe mock call actions and requested long-press visual selection.
- [ ] Calls FAB/choice panel is absent.
- [ ] Bottom nav has requested Lucide icon/label/capsule/badge behavior with no old underline.
- [ ] No protected path, real capability, network or persistence code changed.
- [ ] `git diff --check`, `npm run lint`, `npm test`, and `npm run typecheck` pass.

## Manual APK check after Hermes build

1. Compare all four headers in light/dark mode: geometry, no separator, cloud-only logo and subtitle correctness.
2. Verify Calls and Family have full-width rows, press feedback, callbacks and visual selection/back cancel.
3. Verify Calls has no floating PhonePlus button.
4. Verify bottom icon capsules, labels, unread/missed badges, gesture clearance and tab switching.
5. Check narrow width/larger font does not overflow header or selection action bar.

## Constraints for Fatima

- Read `AGENTS.md`, `docs/STATUS.md`, this task and relevant existing UI/tests first.
- Make timestamped `.bak` beside every existing file before editing.
- Preserve all unrelated dirty changes.
- Do not commit, build, prebuild, run Gradle/APK/emulator/device, start a dev server, or restart anything.
- Run only `npm run lint`, `npm test`, and `npm run typecheck`.
- Return changed paths, exact verification outcomes, backups and limitations.

## Implementation note

- 2026-09-25: implemented in offline UI preview only; verification results are reported in the agent final response.
