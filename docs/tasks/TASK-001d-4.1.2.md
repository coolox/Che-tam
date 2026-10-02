# TASK-001d-4.1.2 — queue manual full run and explain skipped cycles

## Status
Approved by Arslan after field journal showed successful light runs but no full run; a manual full request became unexplained `cycle_skipped`. Implement a single focused v4.1.2 commit.

## Read first
Read `AGENTS.md`, existing monitor/journal/UI/schedule code, v4.1.1 tests, and canonical plan before editing. Preserve all 4.1.1 behavior and do not alter 2K probe implementation except run dispatch/recording integration below.

## Scope and behavior

### 1. Queue manual full runs
- When `wakeupMethod == manual_full` arrives while another run owns the run gate, do not write a skipped record as the terminal outcome.
- Persist/coalesce a pending manual-full request (one queued request is enough). Execute it immediately after the active run releases the gate, on the existing background executor, with a new runId and `wakeupMethod = manual_full` / `runKind = full`.
- A queued manual request must survive Service process recreation as far as shared preferences permits; do not lose it just because a second request arrives.
- Scheduled light/full collisions still do not overlap; record their skip explicitly.

### 2. Explain every `cycle_skipped`
- Extend journal payload/model for `cycle_skipped` to include exactly: `reason` (`overlap`, `budget`, or `other`), `requestedKind` (`light`, `full`, or `manual_full`), and `currentRunId` if a run is active (otherwise null).
- For a manual full that is queued, write either a clearly named queue event/field or a `cycle_skipped` record with `reason=overlap`, `requestedKind=manual_full`, `currentRunId`, plus `queued=true`; the later full run must be observable with its own cycle_start and full summary.
- When heavy work is suppressed because the 10MiB budget is reached, journal a `budget_paused` record and a clear `cycle_skipped`/run outcome with `reason=budget`, requested kind full/manual_full. Do not label it overlap.
- Never log secrets.

### 3. Full schedule verification
- Audit actual `CanarySchedule` / `CanaryRunPlanner` interaction. Ensure the 15-min service cadence selects exactly a `runKind=full` at each UTC hour boundary and light in the other three slots.
- Add deterministic pure JVM tests covering eight consecutive 15-minute slots across two UTC hours: exactly two FULL and six LIGHT. Verify a manual full always selects FULL outside schedule.

### 4. UI full-run status
- On the main screen add a clearly labelled row for last full run, showing time and final outcome (e.g., success/failure/budget-paused/none). Derive this from persisted journal safely without Android network work on main thread. Include latest full `run_summary` plus meaningful fallbacks.
- Refresh after manual/full run request as existing UI does.

### 5. Version/tests/commit
- Set `versionCode = 40102`, `versionName = "4.1.2"`.
- Add focused tests for queue/coalesce/dequeue decision helper; skipped record fields/reasons; two-hour scheduler; UI formatter/model for last full status.
- Run `./gradlew clean testReleaseUnitTest` in `canary-v4/android`; `node --test test/server.test.mjs` in `canary-v4/server`; `git diff --check` root.
- Check staged files exclude secrets, `.env*`, signing/keystore/local.properties, APK/build artifacts/production data.
- Commit exactly `TASK-001d: queue manual full runs v4.1.2`, push `origin/codex/task-001d-canary-v4`.

## Prohibitions
Only Fatima writes code. Do not access secrets, server configuration/services, production data, deploy/restart anything, install APK, or make external writes. No fcm_push.

## Final report
Files, exact test results, commit/push hash, concise explanation of queue semantics and explicit deferred work.