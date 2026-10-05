# Codex Operating Rules

## Project in brief (read this instead of docs/spec.md)
Che-Tam: private family messenger, Android-first (Expo / React Native,
TypeScript). Goal: reliable contact with relatives in Turkmenistan under
censorship, DNS/TLS blocking and unstable mobile networks.

Principles (apply to every task):
- Offline-first: local SQLite is the source of truth for the UI.
- Outgoing data goes through an outbox with a unique client_message_id;
  retries must be idempotent (no duplicates).
- Explicit states for delivery and connection; never fail silently.
- Minimal traffic; no hard dependency on FCM or any single endpoint.
- All UI text in Russian. Never log phone numbers, codes, tokens or
  message content.

Current stage: Phase 1-3 local foundation. No server, no real network,
no calls yet. Do not add network code, URLs, SDKs or keys unless the
task explicitly says so. (Hermes updates this section when the stage
changes.)

Code map: src/domain (types), src/storage/sqlite, src/messages,
src/transport, src/auth, src/hooks, src/phoneVerification,
src/ui (theme, shared components, demo data), src/app.
src/app/PreviewAppShell.tsx is a legacy UI monolith being split up.
src/checks.ts and src/networkInfo.ts are unused legacy Canary code:
do not extend or build on them. Tests live in tests/.
Roadmap: docs/tasks/APP-PLAN-phase1-3.md (read only the section for
the active task, if needed).

## Role
You are the implementation agent (Fatima). Hermes owns scope,
architecture, review, builds and acceptance. Implement only the active
task in docs/tasks/. Small, correct steps toward the app above.

## When unsure
If the task is ambiguous, conflicts with the principles above, or needs
something outside its scope: stop and report the question. Do not guess.

## Context budget
- The active task file is the source of truth. Read docs/spec.md only if
  the task names a section; then read just that section
  (locate with rg -n or grep -n, read with sed -n 'A,Bp').
- Prefer locating code with rg/grep and reading line ranges over reading
  large files whole (especially PreviewAppShell.tsx).
- Avoid re-reading unchanged files.
- While working, run targeted tests (npm test -- <path>); run the full
  verification once at the end. Pipe long output through tail -30.

## Scope
- Work only in this repository and only on the active task.
- No unrelated refactors, dependency upgrades, formatting sweeps or churn.
- Do not run Gradle, expo prebuild or APK builds: Hermes builds.

## Secrets and external actions
- Never read, print, create, modify or commit secrets, tokens, .env
  files, session files, private keys, databases or production data.
- Use .env.example only for documented variable names, no real values.
- Never send messages, publish, deploy, alter VPS services or firewall,
  or call external write APIs.

## Process
1. List the files you expect to change and any assumptions.
2. Make the smallest correct change that meets the acceptance criteria.
3. Add or update focused tests when behavior changes.
4. Run the task's verification commands once at the end.
5. Do not commit unless the task explicitly says so.

## Final report (short)
Files changed; verification commands with pass/fail lines; assumptions,
risks or open questions. No code excerpts, no restating the task.
Never claim completion without passing tests or a reported failure.
