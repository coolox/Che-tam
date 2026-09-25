# Repair Task: UI-017A — выровнять геометрию шапок и списков

- **ID:** `UI-017A`
- **Status:** `accepted — repair manually verified by Arslan in APK che-tam-v0.5.2-round-4-arm64.apk on 2026-09-25`
- **Depends on:** `UI-017` implementation in current dirty worktree
- **Goal:** resolve the two verified UI-017 acceptance failures without widening scope.

## Verified failures

1. `ChatsHeader` has height `insets.top + 64`, while `TopLevelHeader` has padding that produces roughly `insets.top + 80`. This violates the shared header geometry requirement.
2. Calls and Family use normal content top padding, while Chats uses `chatsContent` with zero top padding. This creates an outer gap above Calls/Family lists and violates identical full-width-list geometry.

## Allowed paths

- `App.tsx`
- `__tests__/uiPreview.test.ts` only if a focused pure test is possible
- this task file only for a factual implementation note

## Required changes

- Refactor/adjust normal top-level header styles so **Chats, Calls, Family and Settings have exactly the same height, top inset handling, left/right insets, logo/text vertical alignment and no divider**. Keep Chats search transition behavior intact.
- Keep 48 dp cloud-only `BRAND_MARK`, 16 dp left inset, 12 dp text gap and 48 dp Search target.
- Apply zero top content padding consistently to top-level full-width Chats, Calls and Family lists so the first row begins immediately below the same header geometry. Do not remove Settings' intended panel spacing.
- When choosing a top-level tab, clear stale chat and family visual selection state as needed so Back never first clears selection that is invisible on another tab. Preserve selection behavior while visible.
- Do not change copy, native files, assets, demo data, dependencies, Android config, APIs/capabilities or unrelated call/conversation UI.

## Acceptance criteria

- [ ] Pixel geometry values and inset treatment are shared by normal header on all four tabs.
- [ ] Calls/Family first list row has no outer top gap compared to Chats.
- [ ] No stale invisible selection intercepts Back after tab change.
- [ ] `git diff --check`, `npm run lint`, `npm test`, `npm run typecheck` pass.

## Constraints for Fatima

- Read `AGENTS.md`, `docs/STATUS.md`, `docs/tasks/UI-017-navigation-round-4.md`, this task and existing UI before edits.
- Make timestamped `.bak` files before every existing-file edit.
- Preserve existing dirty worktree changes; touch only allowed paths.
- Do not read `.env`/secrets. Do not commit, build, prebuild, Gradle, APK, emulator/device, dev server or restart services.
- Run only `npm run lint`, `npm test`, `npm run typecheck` (Hermes runs `git diff --check`).
- Return exact changed files, backups, tests and limitations.
