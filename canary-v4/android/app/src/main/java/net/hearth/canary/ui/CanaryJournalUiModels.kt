package net.hearth.canary.ui

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

data class CanaryJournalRecord(
    val timestampUtc: Long,
    val payloadJson: String
)

data class CanaryExportDeviceMetadata(
    val deviceModel: String,
    val androidVersion: String,
    val miuiVersion: String
)

data class CanaryJournalSummary(
    val lastRunText: String,
    val lastRunVerdict: String?,
    val lastFullRunText: String,
    val lastFullRunOutcome: String?,
    val runCount24h: Int,
    val expectedRunCount24h: Int,
    val serverOk24h: Int,
    val serverEligible24h: Int
) {
    val runCountText: String =
        "$runCount24h из $expectedRunCount24h прогонов, сервер $serverOk24h/$serverEligible24h"
}

object CanaryJournalSummaryFormatter {
    fun summarize(records: List<CanaryJournalRecord>, nowUtc: Long): CanaryJournalSummary {
        val summaries = records.mapNotNull { record ->
            val json = record.jsonOrNull() ?: return@mapNotNull null
            if (json.optString("testType") != "run_summary") return@mapNotNull null
            RunSummaryRecord(
                timestampUtc = record.timestampUtc,
                runId = json.optString("runId", ""),
                runKind = json.optString("runKind", "light"),
                verdict = json.optString("runVerdict", "partial")
            )
        }
        val fullBudgetRunIds = records.mapNotNull { record ->
            val json = record.jsonOrNull() ?: return@mapNotNull null
            if (json.optString("testType") == "budget_paused" && json.optString("runKind") == "full") {
                json.optString("runId", "").takeIf { it.isNotBlank() }
            } else {
                null
            }
        }.toSet()
        val latestBudgetFallback = records.mapNotNull { record ->
            val json = record.jsonOrNull() ?: return@mapNotNull null
            val isBudgetSkipped = json.optString("testType") == "cycle_skipped" &&
                json.optString("reason") == "budget" &&
                json.optString("requestedKind") in setOf("full", "manual_full")
            val isBudgetPaused = json.optString("testType") == "budget_paused" &&
                json.optString("runKind") == "full"
            if (isBudgetSkipped || isBudgetPaused) FullRunStatusRecord(record.timestampUtc, "budget-paused") else null
        }.maxByOrNull { it.timestampUtc }
        val newest = summaries.maxByOrNull { it.timestampUtc }
        val newestFullSummary = summaries.filter { it.runKind == "full" }.maxByOrNull { it.timestampUtc }
        val newestFull = newestFullSummary?.let {
            FullRunStatusRecord(
                timestampUtc = it.timestampUtc,
                outcome = if (it.runId.isNotBlank() && it.runId in fullBudgetRunIds) "budget-paused" else it.verdict
            )
        } ?: latestBudgetFallback
        val since = nowUtc - DAY_MS
        val lastDay = summaries.filter { it.timestampUtc >= since }
        val serverEligible = lastDay.filter { it.verdict != "offline" }

        return CanaryJournalSummary(
            lastRunText = newest?.let { "${relativeTime(it.timestampUtc, nowUtc)} — ${it.verdict}" } ?: "нет данных",
            lastRunVerdict = newest?.verdict,
            lastFullRunText = newestFull?.let { "${relativeTime(it.timestampUtc, nowUtc)} — ${it.outcome}" } ?: "нет данных",
            lastFullRunOutcome = newestFull?.outcome,
            runCount24h = lastDay.size,
            expectedRunCount24h = EXPECTED_RUNS_PER_DAY,
            serverOk24h = serverEligible.count { it.verdict == "ok" },
            serverEligible24h = serverEligible.size
        )
    }

    private fun relativeTime(timestampUtc: Long, nowUtc: Long): String {
        val ageMs = (nowUtc - timestampUtc).coerceAtLeast(0L)
        val minutes = ageMs / 60_000L
        val hours = ageMs / 3_600_000L
        val days = ageMs / DAY_MS
        return when {
            minutes < 1L -> "только что"
            minutes < 60L -> "$minutes мин назад"
            hours < 24L -> "$hours ч назад"
            else -> "$days д назад"
        }
    }

    private data class RunSummaryRecord(
        val timestampUtc: Long,
        val runId: String,
        val runKind: String,
        val verdict: String
    )

    private data class FullRunStatusRecord(
        val timestampUtc: Long,
        val outcome: String
    )

    private const val DAY_MS = 24L * 60L * 60L * 1000L
    private const val EXPECTED_RUNS_PER_DAY = 96
}

object CanaryJournalExportFormatter {
    fun buildExportJson(
        exportedAtUtc: Long,
        appVersion: String,
        deviceLabel: String,
        deviceMetadata: CanaryExportDeviceMetadata = CanaryExportDeviceMetadata("", "", ""),
        records: List<CanaryJournalRecord>
    ): String {
        val recordArray = JSONArray()
        records.forEach { record ->
            recordArray.put(record.jsonOrNull() ?: JSONObject().put("payloadJson", record.payloadJson))
        }

        return JSONObject()
            .put("format", FORMAT)
            .put("exportedAtUtc", Instant.ofEpochMilli(exportedAtUtc).toString())
            .put("appVersion", appVersion)
            .put("deviceLabel", deviceLabel)
            .put("deviceModel", deviceMetadata.deviceModel)
            .put("androidVersion", deviceMetadata.androidVersion)
            .put("miuiVersion", deviceMetadata.miuiVersion)
            .put("records", recordArray)
            .toString(2)
    }

    const val FORMAT = "hearth-canary-journal-v4"
}

private fun CanaryJournalRecord.jsonOrNull(): JSONObject? =
    runCatching { JSONObject(payloadJson) }.getOrNull()
