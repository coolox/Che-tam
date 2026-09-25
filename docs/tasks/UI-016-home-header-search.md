# Task: UI-016 — главный экран: брендовая шапка и поиск

- **ID:** `UI-016`
- **Status:** `approved for implementation — Arslan explicitly requested these corrections on 2026-09-25`
- **Priority:** high
- **Owner:** Hermes
- **Implementation agent:** Fatima (Codex CLI)
- **Depends on:** accepted UI-015 chat-list selection behavior; preserve it.

## Goal

Replace the persistent large search field on the Chats tab with a compact branded header and an animated, in-memory search mode. The list must start directly beneath the ordinary header. This is only an offline UI Preview change.

## Requirements

### A. Ordinary chats header

- Remove the large `TextInput` whose placeholder is `Поиск по семье и сообщениям` from the main Chats content. The first chat row (or empty state while filtering) begins directly below the header.
- The Chats header is compact: about 64 dp tall below the top safe-area inset, same background as the chat list, with **no bottom divider**.
- The left brand block has a 16 dp left inset and contains:
  - `assets/brand/che-tam-store-icon.png` as the logo asset (the full green-gradient rounded-square app icon with the glass `чё` cloud), rendered at **44×44 dp**;
  - corner radius about 12 dp and a subtle soft shadow/elevation;
  - a 12 dp gap to its text block;
  - vertically centered logo and text block;
  - title `Чё-Там`, bold, 24–26 sp, `colors.accentDark` or equivalent dark green;
  - subtitle `Семейные разговоры`, grey, 13–14 sp, directly beneath title with 2 dp gap.
- On the right, replace the `offline demo` badge with one accessible icon-only `Search` action from `lucide-react-native`, 24 dp icon and a minimum 48×48 dp tap target. The offline badge must not appear in normal preview UI.
- Do not change the headers of Calls, Family, or Settings except for the minimal prop/state wiring needed to make Chats header behavior correct.

### B. Search mode

- Tapping `Search` on the Chats tab smoothly transitions the ordinary Chats header to a search row.
- Search row structure:
  - left `ArrowLeft` icon-only button, minimum 48×48 dp, accessible label `Закрыть поиск`;
  - a text input with accessible label `Поиск по семье и сообщениям`, placeholder with the same text, auto-focused when search opens and requesting the on-screen keyboard using normal React Native focus behavior;
  - right `X` icon-only clear button, minimum 48×48 dp, accessible label `Очистить поиск`. It clears the query; it may remain visible when empty but must still be safe/no-op.
- Filter chat rows live as text is entered. Search must match chat names and message text. For this in-memory preview, matching `Chat.lastMessage` is sufficient only if it represents the latest text; otherwise search the local `messagesByChat` collection as well. Do not add persistence/network.
- ArrowLeft and Android hardware/system Back while search is active must close search, clear its query, hide/dismiss the keyboard via normal focus cleanup where possible, and restore the normal Chats header.
- If multi-selection is active, existing selection mode/action bar and its Back priority remain intact. Search is not opened in selection mode.
- Existing Back behavior outside search/selection must remain unchanged.
- Empty filtered results retain the existing `Ничего не найдено` state.

### C. Animation and accessibility

- Use existing React Native `Animated` APIs or existing installed dependencies only; no new package.
- Transition is short and unobtrusive (roughly 150–220 ms), without layout jumps or overlap with status-bar safe area.
- All functional icons are from `lucide-react-native`; no emoji, Unicode substitutes, custom SVGs, network/capability APIs, or runtime permissions.

## Allowed scope

- `App.tsx`
- `src/ui/state.ts` for pure in-memory search/search-mode helpers if needed
- `__tests__/uiPreview.test.ts` for focused state/filter/back-transition tests
- this task file only if a factual implementation note is necessary

## Protected paths and strict non-goals

- Do **not** modify any Canary code: `src/nativeMonitor.ts`, `src/storage.ts`, `src/exportJournal.ts`, `src/schedulePolicy.ts`, `src/types.ts`, or native monitoring code.
- Do **not** modify Android resources, manifest, Gradle/build files, `app.json`, existing brand assets, package dependencies, `.env`, secrets, APKs, or generated output.
- Do not add real auth, network, WebRTC, camera, microphone, contacts, notifications, analytics, filesystem persistence, or permissions.
- Do not alter Calls, Family, Settings, conversation, composer, or call UI beyond minimal shared header/back wiring.

## Implementation constraints

- Before changing each existing file, make a timestamped `.bak` copy next to it.
- Preserve unrelated dirty worktree changes from UI-013/UI-014/UI-015.
- Do not commit.
- Fatima must not run `expo prebuild`, Gradle, an APK build, emulator/device, or a dev server.

## Acceptance criteria

- [ ] The large Chats-page search input is gone; chat rows start below the compact normal header.
- [ ] Normal Chats header exactly contains the 44 dp store icon, aligned title/subtitle block, and Lucide Search action; no `offline demo` badge or bottom divider.
- [ ] Tapping Search opens the auto-focused search header with Lucide ArrowLeft and X, and live filters names and message text in memory.
- [ ] X clears query; ArrowLeft and Android Back close search, clear query, and restore normal header.
- [ ] Existing selection-mode Back priority and normal navigation Back contract remain correct.
- [ ] Focused tests cover query matching and the pure state transitions needed for open/clear/close search.
- [ ] `npm run lint`, `npm test`, and `npm run typecheck` pass.

## Verification

Fatima may run only:

```bash
cd /root/projects/che-tam
npm run lint
npm test
npm run typecheck
```

Hermes independently runs:

```bash
cd /root/projects/che-tam
git diff --check
npm run lint
npm test
npm run typecheck
```

## Deferred manual APK checklist

1. Chats header remains clear of status bar and logo/text are vertically aligned.
2. First list row begins directly under header without the old search field/gap.
3. Search opens keyboard and field is focused; typed text filters a name and a message phrase.
4. X clears results; ArrowLeft and Android Back close search rather than leaving keyboard/header stuck.
5. Long-press selection still works, and Back cancels selection before normal navigation.
