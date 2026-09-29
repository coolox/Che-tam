package net.hearth.canary.monitor

import android.content.Context
import net.hearth.canary.light.CanaryPhases
import net.hearth.canary.light.CanaryRunSummary
import net.hearth.canary.light.CanaryTestResult
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

    @Synchronized
    fun appendLightRunRecord(runId: String, result: CanaryTestResult) {
        append(
            JSONObject()
                .put("recordId", UUID.randomUUID().toString())
                .put("runId", runId)
                .put("runKind", "light")
                .put("timestampUtc", System.currentTimeMillis())
                .put("testType", result.testType)
                .put("target", result.target)
                .put("success", result.success)
                .put("errorCategory", result.errorCategory.wireValue)
                .putNullable("errorDetail", result.errorDetail)
                .putNullable("exceptionClass", result.exceptionClass)
                .putNullable("latencyMs", result.latencyMs)
                .put("phases", result.phases.toJson())
                .putNullable("resolvedIp", result.resolvedIp)
                .put("resolvedAddresses", result.resolvedAddresses)
                .putNullable("addressFamily", result.addressFamily?.wireValue)
                .putNullable("previousIp", result.previousIp)
                .putNullable("changed", result.changed)
                .putNullable("httpStatus", result.httpStatus)
                .putNullable("networkType", null)
                .putNullable("bytesTx", result.bytesTx)
                .putNullable("bytesRx", result.bytesRx)
                .putNullable("connectionId", result.connectionId)
                .putNullable("ageSec", result.ageSec)
                .putNullable("sameProcess", result.sameProcess)
                .putNullable("closeCode", result.closeCode)
                .putNullable("closeReason", result.closeReason)
        )
    }

    @Synchronized
    fun appendRunSummary(runId: String, summary: CanaryRunSummary) {
        append(
            JSONObject()
                .put("recordId", UUID.randomUUID().toString())
                .put("runId", runId)
                .put("runKind", "light")
                .put("timestampUtc", System.currentTimeMillis())
                .put("testType", "run_summary")
                .put("testsTotal", summary.testsTotal)
                .put("testsOk", summary.testsOk)
                .put("runVerdict", summary.runVerdict.wireValue)
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

private fun JSONObject.putNullable(name: String, value: Any?): JSONObject =
    put(name, value ?: JSONObject.NULL)

private fun CanaryPhases.toJson(): JSONObject =
    JSONObject()
        .putNullable("dnsMs", dnsMs)
        .putNullable("tcpMs", tcpMs)
        .putNullable("tlsMs", tlsMs)
        .putNullable("httpMs", httpMs)
        .putNullable("upgradeMs", upgradeMs)

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
