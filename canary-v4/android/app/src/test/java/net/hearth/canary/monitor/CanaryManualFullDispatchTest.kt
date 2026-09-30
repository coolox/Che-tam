package net.hearth.canary.monitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CanaryManualFullDispatchTest {
    @Test
    fun manualFullWakeupMethodIsStableWireValue() {
        assertEquals("manual_full", CanaryWakeupMethod.MANUAL_FULL)
    }

    @Test
    fun busyManualFullQueuesAndCoalescesPendingRequest() {
        val first = CanaryManualFullQueue.onGateBusy(CanaryWakeupMethod.MANUAL_FULL, pendingBefore = false)
        val second = CanaryManualFullQueue.onGateBusy(CanaryWakeupMethod.MANUAL_FULL, pendingBefore = true)

        assertTrue(first.pendingAfter)
        assertTrue(first.queued)
        assertTrue(first.writeSkipped)
        assertTrue(second.pendingAfter)
        assertTrue(second.queued)
        assertTrue(second.writeSkipped)
    }

    @Test
    fun busyScheduledRunDoesNotClearQueuedManualFull() {
        val decision = CanaryManualFullQueue.onGateBusy(CanaryWakeupMethod.SERVICE, pendingBefore = true)

        assertTrue(decision.pendingAfter)
        assertFalse(decision.queued)
        assertTrue(decision.writeSkipped)
    }

    @Test
    fun pendingManualFullDrainsOnlyWhenGateIsFree() {
        assertFalse(CanaryManualFullQueue.shouldDrain(pendingBefore = false, gateRunning = false))
        assertFalse(CanaryManualFullQueue.shouldDrain(pendingBefore = true, gateRunning = true))
        assertTrue(CanaryManualFullQueue.shouldDrain(pendingBefore = true, gateRunning = false))
    }
}
