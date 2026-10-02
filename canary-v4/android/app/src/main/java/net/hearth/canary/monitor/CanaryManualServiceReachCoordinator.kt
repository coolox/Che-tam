package net.hearth.canary.monitor

import net.hearth.canary.full.CanaryServiceReachExecutor
import net.hearth.canary.light.CanaryTestResult
import java.util.UUID

class CanaryManualServiceReachCoordinator(
    private val executor: CanaryServiceReachExecutor,
    private val journal: CanaryEventJournal,
    private val runIdFactory: () -> String = { UUID.randomUUID().toString() }
) {
    fun runAndPersist(): List<CanaryTestResult> {
        val runId = runIdFactory()
        val results = executor.runServiceReach()
        results.forEach { result ->
            journal.append(testResultPayload(runId, result).toString())
        }
        return results
    }
}
