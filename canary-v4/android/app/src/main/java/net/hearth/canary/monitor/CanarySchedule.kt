package net.hearth.canary.monitor

object CanarySchedule {
    const val SLOT_MS: Long = 15L * 60L * 1000L
    const val WATCHDOG_GRACE_MS: Long = 2L * 60L * 1000L
    const val WAKE_LOCK_TIMEOUT_MS: Long = 3L * 60L * 1000L

    fun nextSlotAt(nowEpochMs: Long): Long {
        val remainder = Math.floorMod(nowEpochMs, SLOT_MS)
        return if (remainder == 0L) nowEpochMs else nowEpochMs + (SLOT_MS - remainder)
    }

    fun delayMs(nowEpochMs: Long): Long = (nextSlotAt(nowEpochMs) - nowEpochMs).coerceAtLeast(0L)

    fun missedSinceLast(previousScheduledAtMs: Long?, currentScheduledAtMs: Long): Int {
        if (previousScheduledAtMs == null) return 0

        val previousSlot = floorToSlot(previousScheduledAtMs)
        val currentSlot = floorToSlot(currentScheduledAtMs)
        if (currentSlot <= previousSlot) return 0

        val slotsBetweenStarts = (currentSlot - previousSlot) / SLOT_MS
        return (slotsBetweenStarts - 1L).coerceAtLeast(0L).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }

    private fun floorToSlot(epochMs: Long): Long = epochMs - Math.floorMod(epochMs, SLOT_MS)
}
