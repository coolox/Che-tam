package net.hearth.canary.monitor

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface CanaryEventDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    fun insert(event: CanaryEventEntity)

    @Query("DELETE FROM canary_event_journal WHERE timestamp_utc < :cutoffUtc")
    fun deleteOlderThan(cutoffUtc: Long): Int

    @Query("SELECT COUNT(*) FROM canary_event_journal")
    fun count(): Int

    @Query("SELECT COALESCE(MAX(sequence), 0) FROM canary_event_journal")
    fun maxSequence(): Long

    @Query("SELECT * FROM canary_event_journal ORDER BY timestamp_utc DESC, sequence DESC LIMIT :limit")
    fun newestFirst(limit: Int): List<CanaryEventEntity>

    @Query("SELECT * FROM canary_event_journal ORDER BY sequence ASC LIMIT :limit")
    fun oldestFirst(limit: Int): List<CanaryEventEntity>

    @Query("SELECT * FROM canary_event_journal WHERE sent_at_utc IS NULL ORDER BY sequence ASC LIMIT :limit")
    fun unsentOldestFirst(limit: Int): List<CanaryEventEntity>

    @Query("UPDATE canary_event_journal SET sent_at_utc = :sentAtUtc WHERE record_id IN (:recordIds)")
    fun markSent(recordIds: List<String>, sentAtUtc: Long): Int

    @Query("SELECT * FROM canary_event_journal WHERE timestamp_utc >= :sinceUtc ORDER BY sequence ASC")
    fun since(sinceUtc: Long): List<CanaryEventEntity>
}
