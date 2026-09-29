package net.hearth.canary.ui

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class CanaryJournalUiModelsTest {
    @Test
    fun summaryUsesRunSummariesFromLastTwentyFourHours() {
        val now = 10L * 24L * 60L * 60L * 1000L
        val records = listOf(
            record(now - 25L * 60L * 60L * 1000L, "old", "ok"),
            record(now - 20L * 60L * 1000L, "recent-ok", "ok"),
            record(now - 10L * 60L * 1000L, "recent-offline", "offline"),
            record(now - 5L * 60L * 1000L, "recent-partial", "partial")
        )

        val summary = CanaryJournalSummaryFormatter.summarize(records, now)

        assertEquals("5 мин назад — partial", summary.lastRunText)
        assertEquals(3, summary.runCount24h)
        assertEquals(96, summary.expectedRunCount24h)
        assertEquals(1, summary.serverOk24h)
        assertEquals(2, summary.serverEligible24h)
        assertEquals("3 из 96 прогонов, сервер 1/2", summary.runCountText)
    }

    @Test
    fun exportWrapsRecordsInManualJournalFormat() {
        val export = CanaryJournalExportFormatter.buildExportJson(
            exportedAtUtc = 1_800_000_000_000L,
            appVersion = "4.0.1",
            deviceLabel = "local-1",
            deviceMetadata = CanaryExportDeviceMetadata(
                deviceModel = "Google Pixel",
                androidVersion = "15 (SDK 35)",
                miuiVersion = ""
            ),
            records = listOf(record(1_800_000_000_000L, "summary", "ok"))
        )
        val json = JSONObject(export)

        assertEquals("hearth-canary-journal-v4", json.getString("format"))
        assertEquals("2027-01-15T08:00:00Z", json.getString("exportedAtUtc"))
        assertEquals("4.0.1", json.getString("appVersion"))
        assertEquals("local-1", json.getString("deviceLabel"))
        assertEquals("Google Pixel", json.getString("deviceModel"))
        assertEquals("15 (SDK 35)", json.getString("androidVersion"))
        assertEquals("", json.getString("miuiVersion"))
        assertEquals("summary", json.getJSONArray("records").getJSONObject(0).getString("recordId"))
    }

    private fun record(timestampUtc: Long, recordId: String, verdict: String): CanaryJournalRecord =
        CanaryJournalRecord(
            timestampUtc = timestampUtc,
            payloadJson = JSONObject()
                .put("recordId", recordId)
                .put("testType", "run_summary")
                .put("runVerdict", verdict)
                .toString()
        )
}
