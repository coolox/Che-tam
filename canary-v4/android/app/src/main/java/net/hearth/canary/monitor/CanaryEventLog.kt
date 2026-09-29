package net.hearth.canary.monitor

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.UUID

class CanaryEventLog(context: Context) {
    private val file = File(context.filesDir, FILE_NAME)

    @Synchronized
    fun appendCycleStart(fields: CycleStartFields) {
        append(
            JSONObject()
                .put("recordId", UUID.randomUUID().toString())
                .put("testType", "cycle_start")
                .put("wakeupMethod", fields.wakeupMethod)
                .put("scheduledAt", fields.scheduledAt)
                .put("delayMs", fields.delayMs)
                .put("missedSinceLast", fields.missedSinceLast)
                .put("batteryPct", fields.batteryPct)
                .put("isCharging", fields.isCharging)
                .put("batteryOptimizationIgnored", fields.batteryOptimizationIgnored)
                .put("exactAlarmAllowed", fields.exactAlarmAllowed)
                .put("notificationsAllowed", fields.notificationsAllowed)
                .put("uptimeSec", fields.uptimeSec)
                .put("processStartedAt", fields.processStartedAt)
                .put("wifiRssi", fields.wifiRssi)
                .put("wifiLinkMbps", fields.wifiLinkMbps)
        )
    }

    @Synchronized
    fun appendCycleSkipped(wakeupMethod: String, scheduledAt: Long, delayMs: Long) {
        append(
            JSONObject()
                .put("recordId", UUID.randomUUID().toString())
                .put("testType", "cycle_skipped")
                .put("wakeupMethod", wakeupMethod)
                .put("scheduledAt", scheduledAt)
                .put("delayMs", delayMs)
        )
    }

    private fun append(json: JSONObject) {
        file.parentFile?.mkdirs()
        file.appendText(json.toString() + "\n")
    }

    companion object {
        private const val FILE_NAME = "canary-cycle-events.jsonl"
    }
}

data class CycleStartFields(
    val wakeupMethod: String,
    val scheduledAt: Long,
    val delayMs: Long,
    val missedSinceLast: Int,
    val batteryPct: Int?,
    val isCharging: Boolean,
    val batteryOptimizationIgnored: Boolean,
    val exactAlarmAllowed: Boolean,
    val notificationsAllowed: Boolean,
    val uptimeSec: Long,
    val processStartedAt: Long,
    val wifiRssi: Int?,
    val wifiLinkMbps: Int?
)
