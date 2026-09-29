package net.hearth.canary.monitor

import org.json.JSONObject
import org.junit.Assert.assertEquals
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
