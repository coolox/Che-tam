package net.hearth.canary.monitor

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "canary_event_journal",
    indices = [
        Index(value = ["timestamp_utc"]),
        Index(value = ["sequence"])
    ]
)
data class CanaryEventEntity(
    @PrimaryKey
    @ColumnInfo(name = "record_id")
    val recordId: String,
    @ColumnInfo(name = "timestamp_utc")
    val timestampUtc: Long,
    @ColumnInfo(name = "sequence")
    val sequence: Long,
    @ColumnInfo(name = "payload_json")
    val payloadJson: String
)
