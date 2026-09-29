package net.hearth.canary.monitor

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertSame
import org.junit.Test

class CanaryEventJournalTest {
    @Test
    fun prunesOnlyRecordsOlderThanThirtyDays() {
        val now = 2_000_000_000_000L
        val dao = FakeCanaryEventDao()
        val journal = CanaryEventJournal(dao) { now }
        dao.insert(entity("old", now - CanaryEventJournal.RETENTION_MS - 1L, 1L))
        dao.insert(entity("boundary", now - CanaryEventJournal.RETENTION_MS, 2L))
        dao.insert(entity("recent", now - 1L, 3L))

        journal.prune()

        assertEquals(listOf("boundary", "recent"), dao.oldestFirst(10).map { it.recordId })
    }

    @Test
    fun appendPreservesOrderingAndRoundTripsPayload() {
        var now = 3_000_000_000_000L
        val dao = FakeCanaryEventDao()
        val journal = CanaryEventJournal(dao) { now }
        val firstPayload = payload("first", "cycle_start")
        val secondPayload = payload("second", "run_summary")

        journal.append(firstPayload)
        now += 1L
        journal.append(secondPayload)

        assertEquals(listOf("second", "first"), journal.newestFirst(10).map { it.recordId })
        assertEquals(listOf("first", "second"), journal.oldestFirst(10).map { it.recordId })
        assertEquals("run_summary", JSONObject(journal.newestFirst(1).single().payloadJson).getString("testType"))
        assertEquals(2, journal.count())
    }

    @Test
    fun cycleErrorPayloadContainsThrowableFieldsAndTruncatesStack() {
        val throwable = IllegalStateException("boom")
        throwable.stackTrace = (1..25).map {
            StackTraceElement("Class$it", "method$it", "File$it.kt", it)
        }.toTypedArray()

        val payload = cycleErrorPayload("watchdog_set_alarm_clock", throwable)

        assertEquals("cycle_error", payload.getString("testType"))
        assertEquals("watchdog_set_alarm_clock", payload.getString("phase"))
        assertEquals(IllegalStateException::class.java.name, payload.getString("exceptionClass"))
        assertEquals("boom", payload.getString("message"))
        assertEquals(20, payload.getString("stack").lineSequence().count())
        assertTrue(payload.getString("stack").contains("Class19"))
    }

    @Test
    fun cycleStartPayloadIncludesRunCorrelationAndNetworkFields() {
        val payload = cycleStartPayload(
            CycleStartFields(
                runId = "run-1",
                timestampUtc = 1_800_000_000_000L,
                wakeupMethod = "service",
                scheduledAt = 1_799_999_999_000L,
                delayMs = 1_000L,
                missedSinceLast = 0,
                batteryPct = 80,
                isCharging = true,
                batteryOptimizationIgnored = true,
                exactAlarmAllowed = true,
                notificationsAllowed = true,
                uptimeSec = 100L,
                processStartedAt = 1_799_999_900_000L,
                networkType = "wifi",
                wifiRssi = -55,
                wifiLinkMbps = 144
            )
        )

        assertEquals("cycle_start", payload.getString("testType"))
        assertEquals("run-1", payload.getString("runId"))
        assertEquals(1_800_000_000_000L, payload.getLong("timestampUtc"))
        assertEquals("wifi", payload.getString("networkType"))
        assertEquals(-55, payload.getInt("wifiRssi"))
        assertEquals(144, payload.getInt("wifiLinkMbps"))
    }

    @Test
    fun lightRunPayloadSerializesResolvedAddressesAsJsonArray() {
        val payload = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "dns_resolve",
                target = "example.test",
                success = true,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.NONE,
                resolvedAddresses = listOf("203.0.113.1", "2001:db8::1"),
                bytesTx = 12L,
                bytesRx = 34L
            )
        )

        val addresses = payload.get("resolvedAddresses")
        assertSame(org.json.JSONArray::class.java, addresses.javaClass)
        assertEquals("203.0.113.1", payload.getJSONArray("resolvedAddresses").getString(0))
        assertEquals("2001:db8::1", payload.getJSONArray("resolvedAddresses").getString(1))
        assertEquals(12L, payload.getLong("bytesTx"))
        assertEquals(34L, payload.getLong("bytesRx"))
    }

    private fun payload(recordId: String, testType: String): String =
        JSONObject()
            .put("recordId", recordId)
            .put("testType", testType)
            .put("value", "round-trip")
            .toString()

    private fun entity(recordId: String, timestampUtc: Long, sequence: Long): CanaryEventEntity =
        CanaryEventEntity(
            recordId = recordId,
            timestampUtc = timestampUtc,
            sequence = sequence,
            payloadJson = payload(recordId, "seed")
        )
}

private class FakeCanaryEventDao : CanaryEventDao {
    private val events = mutableListOf<CanaryEventEntity>()

    override fun insert(event: CanaryEventEntity) {
        require(events.none { it.recordId == event.recordId })
        events += event
    }

    override fun deleteOlderThan(cutoffUtc: Long): Int {
        val before = events.size
        events.removeAll { it.timestampUtc < cutoffUtc }
        return before - events.size
    }

    override fun count(): Int = events.size

    override fun maxSequence(): Long =
        events.maxOfOrNull { it.sequence } ?: 0L

    override fun newestFirst(limit: Int): List<CanaryEventEntity> =
        events.sortedWith(compareByDescending<CanaryEventEntity> { it.timestampUtc }.thenByDescending { it.sequence })
            .take(limit)

    override fun oldestFirst(limit: Int): List<CanaryEventEntity> =
        events.sortedBy { it.sequence }.take(limit)

    override fun since(sinceUtc: Long): List<CanaryEventEntity> =
        events.filter { it.timestampUtc >= sinceUtc }.sortedBy { it.sequence }
}
