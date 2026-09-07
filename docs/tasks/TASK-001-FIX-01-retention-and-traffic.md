# TASK-001-FIX-01: Исправить retention, трафик и полевые ожидания

- **ID:** `TASK-001-FIX-01`
- **Status:** approved
- **Owner:** Hermes
- **Implementation agent:** Codex CLI
- **Base commit:** `deeaf19`

## Why this task exists

Independent review found that the first TASK-001 implementation cannot yet be accepted:

1. `MAX_RECORDS = 6048` can discard journal history before 21 days when manual checks add extra records.
2. The documented `4320 KB/month` estimate is a made-up payload-only value; it excludes real TLS, HTTP, and WebSocket handshake traffic.
3. Android `expo-background-fetch` is best-effort, not an exact 10-minute clock. Participant instructions must not promise uninterrupted checks.

The public `/hearth-canary/` endpoint currently returns 502 because deployment is explicitly out of scope. This task must not alter infrastructure.

## Product decision

Use an adaptive client policy:

- First 24 hours after the first recorded check: one HTTPS + one WebSocket check every 10 minutes.
- Afterwards: one pair every 60 minutes.
- After a failed pair: return to the 10-minute cadence for the next 60 minutes, then fall back to hourly when checks succeed.
- Manual checks are rate-limited to no more than one pair per 10 minutes. The UI must explain when a manual recheck is temporarily unavailable.

This changes only the Canary probe policy. It does not change the production Hearth messenger specification.

## Allowed scope

- `App.tsx`
- `src/config.ts`, `src/schedulePolicy.ts`, `src/storage.ts`, `src/background.ts`, `src/types.ts`
- relevant files under `__tests__/`
- `README.md`, `docs/participant-instructions-ru.md`, `PROGRESS.md`, `BACKLOG.md`
- this task file if status/notes require an update

## Must not change

- `package.json`, `package-lock.json`, dependencies, Expo SDK, native dependencies, infrastructure, DNS, nginx, TLS, systemd, firewall, or files outside this worktree.
- No secrets, real endpoints, `.env`, external uploads, VPN/tunnel/obfuscation, UDP, TURN, LiveKit, Supabase, or messenger features.

## Requirements

- Preserve at least 21 days of normal journal history. Enforce a manual-check throttle so normal + manual activity cannot evict recent 21-day records merely through repeated taps.
- Add deterministic tests for the adaptive cadence, failure recovery cadence, manual throttling, and retention under expected maximum activity.
- Do not claim a precise monthly KB figure until it is measured against the actual HTTPS/WSS endpoint after infrastructure deployment.
- Replace the 4320 KB claim with an explicit formula or range marked as a planning estimate. State that TLS/WSS handshake overhead makes local payload-only estimates insufficient.
- Record only the existing allowed journal fields; no added personal data or network identifiers.
- Make README and participant instructions explicit: background checks are best-effort and can be delayed/suppressed by Android/vendor battery policy, reboot, force-stop, or a user disabling background activity. The participant should open the app at least once daily and press "Проверить сейчас" if the last record is stale.
- Keep `TASK-001` in progress. No APK build and no field-test completion claim.

## Acceptance criteria

- [ ] `npm ci`, `npm run lint`, `npm test`, and `npm run typecheck` pass.
- [ ] Tests prove a manual tap inside the 10-minute window does not add extra records.
- [ ] Tests prove 21 calendar days of normal adaptive activity remain exportable.
- [ ] README has no unsupported precise monthly traffic promise.
- [ ] No infrastructure or dependency file changes.
- [ ] Commit message begins `TASK-001-FIX-01:`.

## Expected report

- Changed files and commit SHA.
- Exact test outcomes.
- The resulting adaptive schedule and rationale.
- Retention proof.
- Explicit statement that actual byte accounting remains an infrastructure deployment measurement.
