# TASK-001d-4.1.4-repair-manual-journal-test

## Scope
Fix only the currently failing deterministic test in `CanaryEventJournalTest.manualServiceReachCoordinatorPersistsResultsWithOneRunIdAndExportedFields`.

Current real result from Hermes:
`./gradlew testReleaseUnitTest` compiles but fails exactly one test: expected 36 exported `service_reach` records, got 1 at line 435.

Likely check `CanaryEventJournal` timestamp/retention behavior and the test's fixed clock. Preserve production semantics. Make the test's injected journal clock deterministic but compatible with all appended records so all manual results remain exportable. Do not weaken journal retention/pruning production behavior.

Do not change production functionality beyond what is strictly necessary for this test correctness. No server/config/secrets/build/commit/push/external actions.

Run exactly:
`./gradlew testReleaseUnitTest --tests net.hearth.canary.monitor.CanaryEventJournalTest.manualServiceReachCoordinatorPersistsResultsWithOneRunIdAndExportedFields`

Report changed files and exact outcome.
