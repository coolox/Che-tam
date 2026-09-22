# Task: UI Preview foundation and design system

- **ID:** `UI-001`
- **Status:** `approved`
- **Owner:** Hermes
- **Implementation agent:** delegated coding agent

## Goal

Create a separate Expo + TypeScript Android project at `../hearth-preview`, installable beside Canary. It must open a Russian light-theme visual shell for Hearth, with no backend, networking, account data, or real communication.

## Context

- Product: `../hearth/docs/spec.md`, sections 1, 7.1, 7.6, 7.10.
- Delivery intent: `../hearth/docs/hearth-ui-roadmap.md`.
- Design: simple, contemporary, WhatsApp-familiar navigation patterns but original Hearth branding. Focus on readability for family users.

## Allowed scope

Create only within `/root/projects/hearth-preview/`:

- Expo/TypeScript config and package files.
- `App.tsx`, `src/`, `assets/`, focused tests and README.
- Android generated project only after prebuild, if needed for APK delivery.

## Must not do

- Do not modify `/root/projects/hearth/` or Canary.
- No Supabase, server URLs, environment files, auth, sockets, analytics, notifications, camera, microphone, contacts, media permissions, or external calls.
- Do not imitate WhatsApp logos, exact branding, or use its assets.

## Requirements

- [ ] App identity: `Hearth Preview`; package id `net.hearth.preview`; Android 7+; portrait.
- [ ] Light Russian visual shell with original deep-green accent, warm neutral background, readable typography, 44+ dp taps.
- [ ] Shell shows a top header `Hearth`, a coherent placeholder content area, and bottom tabs: `Чаты`, `Звонки`, `Семья`, `Настройки`.
- [ ] Tabs are interactive locally and use placeholder content; no feature screens beyond this task.
- [ ] Add central design tokens for colours, spacing, type, radius instead of scattered magic values.
- [ ] Add a small unit test for the local tab/state helper or a component behavior that does not depend on an Android device.
- [ ] Include README that explicitly says this is an offline visual preview, not a messenger.

## Acceptance criteria

- [ ] `npm run lint`, `npm test`, `npm run typecheck` pass from `hearth-preview`.
- [ ] `npx expo config --json` reports `net.hearth.preview` and no dangerous Android permissions.
- [ ] App has no imports for network, auth, media, or device contacts.
- [ ] No files outside allowed scope changed.

## Verification

```bash
cd /root/projects/hearth-preview
npm run lint
npm test
npm run typecheck
npx expo config --json
```

## Compact implementation prompt

Create only UI-001. Offline Expo TypeScript project in `/root/projects/hearth-preview`; Russian original Hearth visual shell + local tabs. Tokens. No network/auth/permissions/media. Tests+lint+typecheck. Report changed paths + exact command outcomes only.
