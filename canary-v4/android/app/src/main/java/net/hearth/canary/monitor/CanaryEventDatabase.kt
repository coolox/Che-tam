package net.hearth.canary.monitor

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [CanaryEventEntity::class],
    version = 1,
    exportSchema = false
)
abstract class CanaryEventDatabase : RoomDatabase() {
    abstract fun eventDao(): CanaryEventDao

    companion object {
        @Volatile
        private var instance: CanaryEventDatabase? = null

        fun get(context: Context): CanaryEventDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    CanaryEventDatabase::class.java,
                    "canary-event-journal.db"
                )
                    .allowMainThreadQueries()
                    .build()
                    .also { instance = it }
            }
    }
}
