package net.hearth.canary.monitor

class CanaryEventJournal(
    private val dao: CanaryEventDao,
    private val clock: () -> Long = System::currentTimeMillis
) {
    @Synchronized
    fun append(payloadJson: String): CanaryEventEntity {
        val timestampUtc = clock()
        prune(timestampUtc)
        val entity = CanaryEventEntity(
            recordId = payloadJsonRecordId(payloadJson),
            timestampUtc = timestampUtc,
            sequence = dao.maxSequence() + 1L,
            payloadJson = payloadJson
        )
        dao.insert(entity)
        return entity
    }

    @Synchronized
    fun prune(nowUtc: Long = clock()): Int =
        dao.deleteOlderThan(cutoffUtc(nowUtc))

    fun count(): Int = dao.count()

    fun newestFirst(limit: Int): List<CanaryEventEntity> =
        dao.newestFirst(limit.coerceAtLeast(0))

    fun oldestFirst(limit: Int): List<CanaryEventEntity> =
        dao.oldestFirst(limit.coerceAtLeast(0))

    private fun payloadJsonRecordId(payloadJson: String): String =
        org.json.JSONObject(payloadJson).getString("recordId")

    companion object {
        const val RETENTION_DAYS = 30L
        const val RETENTION_MS = RETENTION_DAYS * 24L * 60L * 60L * 1000L

        fun cutoffUtc(nowUtc: Long): Long = nowUtc - RETENTION_MS
    }
}
