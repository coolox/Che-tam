package net.hearth.canary.light

import org.junit.Assert.assertEquals
import org.junit.Test

class CanaryRunVerdictDeriverTest {
    @Test
    fun derivesOkWhenAllServerLightTestsPass() {
        val summary = CanaryRunVerdictDeriver.deriveLight(
            controls(success = true) + listOf(record("control_dns", true)) + server(success = true)
        )

        assertEquals(9, summary.testsTotal)
        assertEquals(9, summary.testsOk)
        assertEquals(CanaryRunVerdict.OK, summary.runVerdict)
    }

    @Test
    fun derivesOfflineWhenAllControlsFail() {
        val summary = CanaryRunVerdictDeriver.deriveLight(
            controls(success = false) + listOf(record("control_dns", false)) + server(success = false)
        )

        assertEquals(9, summary.testsTotal)
        assertEquals(CanaryRunVerdict.OFFLINE, summary.runVerdict)
    }

    @Test
    fun derivesServerBlockedWithoutFullRunOnlyVerdicts() {
        val summary = CanaryRunVerdictDeriver.deriveLight(
            controls(success = true) + listOf(record("control_dns", true)) + server(success = false)
        )

        assertEquals(9, summary.testsTotal)
        assertEquals(CanaryRunVerdict.SERVER_BLOCKED, summary.runVerdict)
    }

    @Test
    fun includesAggregateRunTrafficWhenAvailable() {
        val summary = CanaryRunVerdictDeriver.deriveLight(
            controls(success = true) + listOf(record("control_dns", true)) + server(success = true),
            runTraffic = CanaryTrafficSample(bytesTx = 10L, bytesRx = 20L)
        )

        assertEquals(10L, summary.bytesTx)
        assertEquals(20L, summary.bytesRx)
    }

    private fun controls(success: Boolean): List<CanaryTestResult> =
        (1..5).map { record("control_http", success) }

    private fun server(success: Boolean): List<CanaryTestResult> =
        listOf("dns_resolve", "http_domain", "ws_keepalive").map { record(it, success) }

    private fun record(testType: String, success: Boolean): CanaryTestResult =
        CanaryTestResult(
            testType = testType,
            target = testType,
            success = success,
            errorCategory = if (success) CanaryErrorCategory.NONE else CanaryErrorCategory.OTHER
        )
}
