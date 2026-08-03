package ai.dikestra.arkachat.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import ai.dikestra.arkachat.model.Contact
import ai.dikestra.arkachat.model.Group
import ai.dikestra.arkachat.model.GroupKey
import ai.dikestra.arkachat.model.GroupMember
import ai.dikestra.arkachat.model.Message

@Database(
    entities = [Message::class, Contact::class, Group::class, GroupMember::class, GroupKey::class],
    version = 2,
    exportSchema = false
)
abstract class ChatDatabase : RoomDatabase() {

    abstract fun messageDao(): MessageDao
    abstract fun contactDao(): ContactDao
    abstract fun groupDao(): GroupDao

    companion object {
        @Volatile
        private var INSTANCE: ChatDatabase? = null

        fun getInstance(context: Context): ChatDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): ChatDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                ChatDatabase::class.java,
                "arkachat.db"
            )
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
