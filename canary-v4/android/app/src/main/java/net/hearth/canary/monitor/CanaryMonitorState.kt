package net.hearth.canary.monitor

import android.content.Context

object CanaryMonitorState {
    fun markWatchdogScheduled(context: Context, expectedCycleAtMs: Long, triggerAtMs: Long) {
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_EXPECTED_CYCLE_AT, expectedCycleAtMs)
            .putLong(KEY_WATCHDOG_TRIGGER_AT, triggerAtMs)
            .apply()
    }

    fun snapshot(context: Context, nowUtc: Long = System.currentTimeMillis()): MonitorStateSnapshot {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val expectedCycleAt = prefs.getLong(KEY_EXPECTED_CYCLE_AT, Long.MIN_VALUE)
            .takeUnless { it == Long.MIN_VALUE }
        val watchdogTriggerAt = prefs.getLong(KEY_WATCHDOG_TRIGGER_AT, Long.MIN_VALUE)
            .takeUnless { it == Long.MIN_VALUE }

        return MonitorStateSnapshot(
            runInProgress = CanaryRunGate.isRunning(),
            nextExpectedCycleAt = expectedCycleAt,
            watchdogTriggerAt = watchdogTriggerAt,
            scheduledRecently = watchdogTriggerAt?.let { it >= nowUtc - STALE_SCHEDULE_MS } ?: false
        )
    }

    private const val PREFS_NAME = "canary_monitor_state"
    private const val KEY_EXPECTED_CYCLE_AT = "expectedCycleAt"
    private const val KEY_WATCHDOG_TRIGGER_AT = "watchdogTriggerAt"
    private const val STALE_SCHEDULE_MS = 30L * 60L * 1000L
}

data class MonitorStateSnapshot(
    val runInProgress: Boolean,
    val nextExpectedCycleAt: Long?,
    val watchdogTriggerAt: Long?,
    val scheduledRecently: Boolean
)
