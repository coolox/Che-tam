package net.hearth.canary.light

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CanaryPhaseTrackerTest {
    @Test
    fun untouchedPhasesRemainNull() {
        val phases = CanaryPhaseTracker { 0L }.snapshot()

        assertNull(phases.dnsMs)
        assertNull(phases.tcpMs)
        assertNull(phases.tlsMs)
        assertNull(phases.httpMs)
        assertNull(phases.upgradeMs)
    }

    @Test
    fun failedStartedStageIsMarkedMinusOne() {
        var now = 100L
        val tracker = CanaryPhaseTracker { now }

        tracker.dnsStart()
        now = 125L
        tracker.dnsEnd()
        tracker.tcpStart()
        tracker.fail()

        val phases = tracker.snapshot()
        assertEquals(25L, phases.dnsMs)
        assertEquals(-1L, phases.tcpMs)
        assertNull(phases.tlsMs)
    }
}
