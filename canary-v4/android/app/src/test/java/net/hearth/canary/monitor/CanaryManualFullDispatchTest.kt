package net.hearth.canary.monitor

import org.junit.Assert.assertEquals
import org.junit.Test

class CanaryManualFullDispatchTest {
    @Test
    fun manualFullWakeupMethodIsStableWireValue() {
        assertEquals("manual_full", CanaryWakeupMethod.MANUAL_FULL)
    }
}
