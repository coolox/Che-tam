package net.hearth.canary.monitor

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [CanaryEventEntity::class],
    version = 2,
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
                    .addMigrations(MIGRATION_1_2)
                    .allowMainThreadQueries()
                    .build()
                    .also { instance = it }
            }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE canary_event_journal ADD COLUMN sent_at_utc INTEGER")
            }
        }
    }
}
