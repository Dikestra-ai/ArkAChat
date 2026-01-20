package ai.guard8.chatguard.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import ai.guard8.chatguard.model.Contact
import ai.guard8.chatguard.model.Group
import ai.guard8.chatguard.model.GroupKey
import ai.guard8.chatguard.model.GroupMember
import ai.guard8.chatguard.model.Message

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
                "chatguard.db"
            )
                .fallbackToDestructiveMigration()
                .build()
        }
    }
}
