package net.hearth.canary.monitor

import android.content.Context
import net.hearth.canary.light.CanaryPhases
import net.hearth.canary.light.CanaryRunSummary
import net.hearth.canary.light.CanaryTestResult
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class CanaryEventLog(context: Context) {
    private val journal = CanaryEventJournal(CanaryEventDatabase.get(context).eventDao()).also {
        it.prune()
    }

    @Synchronized
    fun appendCycleStart(fields: CycleStartFields) {
        append(cycleStartPayload(fields))
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
        append(lightRunPayload(runId, result))
    }

    @Synchronized
    fun appendRunSummary(runId: String, summary: CanaryRunSummary) {
        append(runSummaryPayload(runId, summary))
    }

    @Synchronized
    fun appendCycleError(phase: String, throwable: Throwable) {
        append(cycleErrorPayload(phase, throwable))
    }

    private fun append(json: JSONObject) {
        journal.append(json.toString())
    }
}

object CanaryCycleErrorReporter {
    fun append(context: Context, phase: String, throwable: Throwable) {
        runCatching {
            CanaryEventLog(context.applicationContext).appendCycleError(phase, throwable)
        }
    }
}

fun cycleErrorPayload(phase: String, throwable: Throwable): JSONObject =
    JSONObject()
        .put("recordId", UUID.randomUUID().toString())
        .put("timestampUtc", System.currentTimeMillis())
        .put("testType", "cycle_error")
        .put("phase", phase)
        .put("exceptionClass", throwable.javaClass.name)
        .putNullable("message", throwable.message)
        .put("stack", throwable.stackTraceToString().lineSequence().take(MAX_CYCLE_ERROR_STACK_LINES).joinToString("\n"))

internal fun cycleStartPayload(fields: CycleStartFields): JSONObject =
    JSONObject()
        .put("recordId", UUID.randomUUID().toString())
        .put("runId", fields.runId)
        .put("timestampUtc", fields.timestampUtc)
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
        .put("networkType", fields.networkType)
        .put("wifiRssi", fields.wifiRssi)
        .put("wifiLinkMbps", fields.wifiLinkMbps)

internal fun lightRunPayload(runId: String, result: CanaryTestResult): JSONObject =
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
        .put("resolvedAddresses", JSONArray(result.resolvedAddresses))
        .putNullable("addressFamily", result.addressFamily?.wireValue)
        .putNullable("previousIp", result.previousIp)
        .putNullable("changed", result.changed)
        .putNullable("httpStatus", result.httpStatus)
        .putNullable("networkType", result.networkType)
        .putNullable("bytesTx", result.bytesTx?.takeIf { it > 0L })
        .putNullable("bytesRx", result.bytesRx?.takeIf { it > 0L })
        .putNullable("connectionId", result.connectionId)
        .putNullable("ageSec", result.ageSec)
        .putNullable("sameProcess", result.sameProcess)
        .putNullable("closeCode", result.closeCode)
        .putNullable("closeReason", result.closeReason)

internal fun runSummaryPayload(runId: String, summary: CanaryRunSummary): JSONObject =
    JSONObject()
        .put("recordId", UUID.randomUUID().toString())
        .put("runId", runId)
        .put("runKind", "light")
        .put("timestampUtc", System.currentTimeMillis())
        .put("testType", "run_summary")
        .put("testsTotal", summary.testsTotal)
        .put("testsOk", summary.testsOk)
        .put("runVerdict", summary.runVerdict.wireValue)
        .putNullable("bytesTx", summary.bytesTx?.takeIf { it >= 0L })
        .putNullable("bytesRx", summary.bytesRx?.takeIf { it >= 0L })

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
    val runId: String,
    val timestampUtc: Long,
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
    val networkType: String,
    val wifiRssi: Int?,
    val wifiLinkMbps: Int?
)

private const val MAX_CYCLE_ERROR_STACK_LINES = 20
