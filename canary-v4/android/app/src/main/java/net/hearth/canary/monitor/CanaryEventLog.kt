package net.hearth.canary.monitor

import android.content.Context
import net.hearth.canary.light.CanaryPhases
import net.hearth.canary.light.CanaryRunSummary
import net.hearth.canary.light.CanaryTestResult
import net.hearth.canary.light.CanaryWsClosedEvent
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
    fun appendCycleSkipped(
        wakeupMethod: String,
        scheduledAt: Long,
        delayMs: Long,
        reason: String,
        requestedKind: String,
        currentRunId: String?,
        queued: Boolean = false
    ) {
        append(
            cycleSkippedPayload(
                wakeupMethod = wakeupMethod,
                scheduledAt = scheduledAt,
                delayMs = delayMs,
                reason = reason,
                requestedKind = requestedKind,
                currentRunId = currentRunId,
                queued = queued
            )
        )
    }

    @Synchronized
    fun appendLightRunRecord(runId: String, result: CanaryTestResult) {
        append(testResultPayload(runId, result))
    }

    @Synchronized
    fun appendRunSummary(runId: String, summary: CanaryRunSummary, runKind: String = "light") {
        append(runSummaryPayload(runId, summary, runKind))
    }

    @Synchronized
    fun appendWsClosedEvent(event: CanaryWsClosedEvent) {
        append(wsClosedEventPayload(event))
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
        .put("screenOn", fields.screenOn)
        .put("deviceIdleMode", fields.deviceIdleMode)
        .put("powerSaveMode", fields.powerSaveMode)
        .putNullable("appStandbyBucket", fields.appStandbyBucket)
        .put("exactAlarmAllowed", fields.exactAlarmAllowed)
        .put("notificationsAllowed", fields.notificationsAllowed)
        .put("uptimeSec", fields.uptimeSec)
        .put("processStartedAt", fields.processStartedAt)
        .put("networkType", fields.networkType)
        .put("wifiRssi", fields.wifiRssi)
        .put("wifiLinkMbps", fields.wifiLinkMbps)
        .put("gmsAvailable", fields.gmsAvailable)

internal fun cycleSkippedPayload(
    wakeupMethod: String,
    scheduledAt: Long,
    delayMs: Long,
    reason: String,
    requestedKind: String,
    currentRunId: String?,
    queued: Boolean = false
): JSONObject =
    JSONObject()
        .put("recordId", UUID.randomUUID().toString())
        .put("timestampUtc", System.currentTimeMillis())
        .put("testType", "cycle_skipped")
        .put("wakeupMethod", wakeupMethod)
        .put("scheduledAt", scheduledAt)
        .put("delayMs", delayMs)
        .put("reason", reason)
        .put("requestedKind", requestedKind)
        .putNullable("currentRunId", currentRunId)
        .put("queued", queued)

internal fun lightRunPayload(runId: String, result: CanaryTestResult): JSONObject =
    testResultPayload(runId, result.copy(runKind = "light"))

internal fun testResultPayload(runId: String, result: CanaryTestResult): JSONObject =
    JSONObject()
        .put("recordId", UUID.randomUUID().toString())
        .put("runId", runId)
        .put("runKind", result.runKind ?: "light")
        .put("timestampUtc", System.currentTimeMillis())
        .put("testType", result.testType)
        .put("target", result.target)
        .putNullable("service", result.service)
        .putNullable("host", result.host)
        .putNullable("port", result.port)
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
        .putNullable("screenOn", result.screenOn)
        .putNullable("deviceIdleMode", result.deviceIdleMode)
        .putNullable("bytesTx", result.bytesTx?.takeIf { it > 0L })
        .putNullable("bytesRx", result.bytesRx?.takeIf { it > 0L })
        .putNullable("connectionId", result.connectionId)
        .putNullable("ageSec", result.ageSec)
        .putNullable("sameProcess", result.sameProcess)
        .putNullable("closeCode", result.closeCode)
        .putNullable("closeReason", result.closeReason)
        .putNullable("sni", result.sni)
        .putNullable("mode", result.mode)
        .putNullable("protocol", result.protocol)
        .putNullable("certTrusted", result.certTrusted)
        .putNullable("provider", result.provider)
        .put("valuesMs", JSONArray(result.valuesMs))
        .putNullable("count", result.count)
        .putNullable("minMs", result.minMs)
        .putNullable("medianMs", result.medianMs)
        .putNullable("p90Ms", result.p90Ms)
        .putNullable("maxMs", result.maxMs)
        .putNullable("lost", result.lost)
        .putNullable("connectMs", result.connectMs)
        .putNullable("tcpMs", result.tcpMs)
        .putNullable("tlsMs", result.tlsMs)
        .putNullable("udpMs", result.udpMs)
        .putNullable("allocateMs", result.allocateMs)
        .putNullable("echoRttMs", result.echoRttMs)
        .putNullable("echoBytes", result.echoBytes)
        .putNullable("throughputKbps", result.throughputKbps)
        .putNullable("turnErrorCode", result.turnErrorCode)
        .putNullable("payloadBytes", result.payloadBytes)
        .putNullable("bytesConfirmed", result.bytesConfirmed)
        .putNullable("bytesToday", result.bytesToday)
        .putNullable("intervalSec", result.intervalSec)
        .putNullable("alive", result.alive)
        .putNullable("pingsSent", result.pingsSent)
        .putNullable("pongsMissed", result.pongsMissed)
        .putNullable("lastInboundAtMs", result.lastInboundAtMs)
        .putNullable("lastOutboundAtMs", result.lastOutboundAtMs)
        .putNullable("reason", result.reason)
        .putNullable("detectedBy", result.detectedBy)

internal fun runSummaryPayload(runId: String, summary: CanaryRunSummary, runKind: String = "light"): JSONObject =
    JSONObject()
        .put("recordId", UUID.randomUUID().toString())
        .put("runId", runId)
        .put("runKind", runKind)
        .put("timestampUtc", System.currentTimeMillis())
        .put("testType", "run_summary")
        .put("testsTotal", summary.testsTotal)
        .put("testsOk", summary.testsOk)
        .put("runVerdict", summary.runVerdict.wireValue)
        .putNullable("bytesTx", summary.bytesTx?.takeIf { it >= 0L })
        .putNullable("bytesRx", summary.bytesRx?.takeIf { it >= 0L })

internal fun wsClosedEventPayload(event: CanaryWsClosedEvent): JSONObject =
    JSONObject()
        .put("recordId", UUID.randomUUID().toString())
        .put("timestampUtc", event.timestampUtc)
        .put("testType", "ws_closed_event")
        .put("connectionId", event.connectionId)
        .put("ageSec", event.ageSec)
        .putNullable("closeCode", event.closeCode)
        .putNullable("exceptionClass", event.exceptionClass)
        .put("networkType", event.networkType)
        .putNullable("screenOn", event.screenOn)
        .put("detectedBy", event.detectedBy)

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
    val screenOn: Boolean,
    val deviceIdleMode: Boolean,
    val powerSaveMode: Boolean,
    val appStandbyBucket: Int?,
    val exactAlarmAllowed: Boolean,
    val notificationsAllowed: Boolean,
    val uptimeSec: Long,
    val processStartedAt: Long,
    val networkType: String,
    val wifiRssi: Int?,
    val wifiLinkMbps: Int?,
    val gmsAvailable: Boolean
)

private const val MAX_CYCLE_ERROR_STACK_LINES = 20
