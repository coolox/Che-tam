package net.hearth.canary.monitor

import net.hearth.canary.full.CanaryRunKind
import net.hearth.canary.full.CanaryRunPlanner
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

    @Test
    fun plannerSelectsExactlyTwoFullRunsAcrossEightFifteenMinuteUtcSlots() {
        val start = 3_600_000L
        val kinds = (0 until 8).map { slot ->
            CanaryRunPlanner.kindForSlot(start + slot * CanarySchedule.SLOT_MS)
        }

        assertEquals(2, kinds.count { it == CanaryRunKind.FULL })
        assertEquals(6, kinds.count { it == CanaryRunKind.LIGHT })
        assertEquals(
            listOf(
                CanaryRunKind.FULL,
                CanaryRunKind.LIGHT,
                CanaryRunKind.LIGHT,
                CanaryRunKind.LIGHT,
                CanaryRunKind.FULL,
                CanaryRunKind.LIGHT,
                CanaryRunKind.LIGHT,
                CanaryRunKind.LIGHT
            ),
            kinds
        )
    }

    @Test
    fun manualFullWakeupSelectsFullOutsideHourlySchedule() {
        assertEquals(
            CanaryRunKind.FULL,
            CanaryRunPlanner.kindForWakeup(CanaryWakeupMethod.MANUAL_FULL, 3_600_000L + CanarySchedule.SLOT_MS)
        )
    }
}
