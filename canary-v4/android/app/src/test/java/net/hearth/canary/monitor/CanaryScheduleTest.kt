package net.hearth.canary.monitor

import org.junit.Assert.assertEquals
import org.junit.Test

class CanaryScheduleTest {
    @Test
    fun delayMsReturnsZeroOnSlotBoundary() {
        assertEquals(0L, CanarySchedule.delayMs(30L * 60L * 1000L))
    }

    @Test
    fun delayMsReturnsRemainderToNextFifteenMinuteSlot() {
        assertEquals(14L * 60L * 1000L, CanarySchedule.delayMs(31L * 60L * 1000L))
    }

    @Test
    fun delayMsHandlesNegativeInstantsWithoutNegativeDelay() {
        assertEquals(60_000L, CanarySchedule.delayMs(-60_000L))
    }

    @Test
    fun missedSinceLastIsZeroForFirstCycleAndAdjacentSlots() {
        val slot = CanarySchedule.SLOT_MS

        assertEquals(0, CanarySchedule.missedSinceLast(null, slot))
        assertEquals(0, CanarySchedule.missedSinceLast(slot, slot * 2))
    }

    @Test
    fun missedSinceLastCountsStrictlySkippedFifteenMinuteSlots() {
        val slot = CanarySchedule.SLOT_MS

        assertEquals(2, CanarySchedule.missedSinceLast(slot, slot * 4))
    }

    @Test
    fun missedSinceLastFloorsOffBoundaryPreviousAndCurrentValues() {
        val slot = CanarySchedule.SLOT_MS

        assertEquals(1, CanarySchedule.missedSinceLast(slot + 1L, slot * 3 + 1L))
    }
}
