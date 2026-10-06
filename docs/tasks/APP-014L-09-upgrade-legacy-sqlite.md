# APP-014L-09 — safe upgrade from every prior SQLite schema

## Incident
On a phone upgraded over the old local DB (0c20088 / v0.6.3), bootstrap shows `Не удалось открыть локальные данные. Код: Error-1ua73u`; clearing app data masks it. Reproduce it on **node:sqlite** using a database created by the exact `0c20088` migration/schema, then bootstrap current code. Derive/confirm the underlying thrown text through `hashErrorText`, not by guessing.

## Goal
Fix migration/bootstrap so an installed app upgrades safely rather than requiring app-data deletion. Establish a permanent test that starts a real node:sqlite file at every historical schema version and applies all later migrations; future migrations must extend that fixture/test.

## Requirements
1. Add a real node:sqlite upgrade fixture/utility that creates schema state exactly matching historical migration versions from repository Git history or a faithful explicit immutable fixture. At minimum cover pre-v1/v0 fixture and v1 as shipped in `0c20088`; current v2 must boot cleanly with persisted v1 rows intact. The regression must reproduce Error hash `Error-1ua73u` before the fix or document/assert the exact original source error whose FNV hash is `1ua73u`.
2. Refactor migration implementation to an ordered, declarative migration registry (version + statements), with validation that migration versions are contiguous/unique and an upgrade path runs each un-applied migration in order. Do not use schema current-version as a substitute for actual applied versions.
3. Fix the real node:sqlite incompatibility/SQL error. The production migration code must be valid for Expo SQLite and node:sqlite. Preserve atomic migration behavior, foreign-key setup before migrations, idempotence, old v1 data, and no destructive reset.
4. Permanent test: for **each historical starting version** create a real temporary SQLite DB, upgrade it to latest, assert expected schema_migrations and retained rows; make the test derive its starts from the registry or explicit immutable fixtures such that adding v3 requires extending coverage deliberately.
5. Add a direct local message-store bootstrap test against real v1 DB proving it reaches `ready`, with no local error. Keep existing tests green.

## Constraints
This is local-only before ADR-002. No server/network calls; no changed UX besides removing the bootstrap error. Do not change ADR-002, app version/versionCode, invitation/auth, keyboard, test-mode semantics, drafts data model, APP-013L correction notes. Do not commit/push/build.

## Verify
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -20
```
