package net.hearth.canary

import android.content.Context
import org.json.JSONObject
import java.time.Instant

/**
 * Durable scheduler coordination shared by the foreground service, WorkManager, and manual bridge.
 * All state changes use synchronous commits so a newly started Android component observes them.
 */
internal class CanaryScheduleState(context: Context) {
  private val preferences = context.getSharedPreferences(CanaryMonitorService.PREFERENCES, Context.MODE_PRIVATE)

  fun acquireLease(nowMs: Long = System.currentTimeMillis()): Boolean = synchronized(lock) {
    val leaseUntilMs = preferences.getLong(LEASE_UNTIL_MS_KEY, 0)
    if (leaseUntilMs > nowMs) return false
    preferences.edit().putLong(LEASE_UNTIL_MS_KEY, nowMs + LEASE_DURATION_MS).commit()
  }

  fun releaseLease() = synchronized(lock) {
    preferences.edit().remove(LEASE_UNTIL_MS_KEY).commit()
  }

  fun recordCycleStarted(nowMs: Long) = synchronized(lock) {
    preferences.edit().putLong(LAST_STARTED_MS_KEY, nowMs).commit()
  }

  fun recordCycleCompleted(nowMs: Long) = synchronized(lock) {
    preferences.edit().putLong(LAST_COMPLETED_MS_KEY, nowMs).commit()
  }

  fun lastCompletedMs(): Long? = preferences.getLong(LAST_COMPLETED_MS_KEY, 0).takeIf { it > 0 }

  fun missedCycleRecords(nowMs: Long, appState: String): List<JSONObject> {
    val completedMs = lastCompletedMs() ?: return emptyList()
    val missed = mutableListOf<JSONObject>()
    var expectedMs = completedMs + CanaryMonitorService.INTERVAL_MS
    // The cycle now being started satisfies the most recent due slot. Only older slots were missed.
    while (expectedMs + CanaryMonitorService.INTERVAL_MS <= nowMs) {
      missed += JSONObject().apply {
        put("timestampUtc", Instant.ofEpochMilli(nowMs).toString())
        put("checkRunKey", "missed:${Instant.ofEpochMilli(expectedMs)}")
        put("testType", "missed_cycle")
        put("target", "scheduled_cycle")
        put("success", false)
        put("httpStatus", JSONObject.NULL)
        put("latencyMs", 0)
        put("phases", JSONObject().apply { put("dnsMs", JSONObject.NULL); put("tcpMs", JSONObject.NULL); put("tlsMs", JSONObject.NULL); put("httpMs", JSONObject.NULL) })
        put("resolvedIp", JSONObject.NULL)
        put("networkType", "unknown")
        put("carrier", JSONObject.NULL)
        put("appState", appState)
        put("errorCategory", "unknown")
        put("errorDetail", "scheduled cycle was not observed at its expected time")
      }
      expectedMs += CanaryMonitorService.INTERVAL_MS
    }
    return missed
  }

  fun notificationStatus(): String {
    val completedMs = lastCompletedMs() ?: return "ожидается первая проверка"
    return "последняя завершена ${Instant.ofEpochMilli(completedMs)} UTC"
  }

  companion object {
    private const val LEASE_UNTIL_MS_KEY = "nativeRunLeaseUntilMs"
    private const val LAST_STARTED_MS_KEY = "lastNativeCycleStartedAtUtc"
    private const val LAST_COMPLETED_MS_KEY = "lastNativeCycleCompletedAtUtc"
    private const val LEASE_DURATION_MS = 2 * 60 * 1000L
    private val lock = Any()
  }
}
