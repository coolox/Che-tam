package net.hearth.canary.full

import android.content.Context
import java.time.Instant
import java.time.ZoneOffset

class CanaryTrafficBudget(context: Context, private val clock: () -> Long = System::currentTimeMillis) {
    private val prefs = context.applicationContext.getSharedPreferences("canary_traffic_budget", Context.MODE_PRIVATE)

    fun bytesToday(): Long = state().bytesToday

    fun canRunHeavy(): Boolean = bytesToday() < DAILY_LIMIT_BYTES

    fun addServerBytes(bytes: Long) {
        if (bytes <= 0L) return
        val state = state()
        prefs.edit()
            .putString(KEY_DAY, state.day)
            .putLong(KEY_BYTES, state.bytesToday + bytes)
            .apply()
    }

    fun markPauseEmitted(): Boolean {
        val state = state()
        if (prefs.getString(KEY_PAUSE_DAY, null) == state.day) return false
        prefs.edit().putString(KEY_PAUSE_DAY, state.day).apply()
        return true
    }

    private fun state(): BudgetState {
        val today = utcDay(clock())
        val storedDay = prefs.getString(KEY_DAY, null)
        if (storedDay != today) {
            prefs.edit().putString(KEY_DAY, today).putLong(KEY_BYTES, 0L).remove(KEY_PAUSE_DAY).apply()
            return BudgetState(today, 0L)
        }
        return BudgetState(today, prefs.getLong(KEY_BYTES, 0L).coerceAtLeast(0L))
    }

    data class BudgetState(val day: String, val bytesToday: Long)

    companion object {
        const val DAILY_LIMIT_BYTES = 10L * 1024L * 1024L
        private const val KEY_DAY = "day"
        private const val KEY_BYTES = "bytes"
        private const val KEY_PAUSE_DAY = "pauseDay"

        fun utcDay(epochMs: Long): String =
            Instant.ofEpochMilli(epochMs).atZone(ZoneOffset.UTC).toLocalDate().toString()
    }
}
