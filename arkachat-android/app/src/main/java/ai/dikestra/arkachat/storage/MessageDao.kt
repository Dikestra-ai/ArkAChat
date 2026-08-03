package ai.dikestra.arkachat.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import ai.dikestra.arkachat.model.Message
import ai.dikestra.arkachat.model.MessageStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {

    @Query("SELECT * FROM messages WHERE contactId = :contactId ORDER BY timestamp ASC")
    fun getMessagesForContact(contactId: String): Flow<List<Message>>

    @Query("SELECT * FROM messages WHERE contactId = :contactId ORDER BY timestamp ASC")
    suspend fun getMessagesForContactSync(contactId: String): List<Message>

    @Query("SELECT * FROM messages WHERE id = :messageId")
    suspend fun getById(messageId: String): Message?

    @Query("SELECT * FROM messages WHERE contactId = :contactId ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLastMessage(contactId: String): Message?

    @Query("SELECT * FROM messages WHERE contactId = :contactId ORDER BY timestamp DESC LIMIT 1")
    fun getLastMessageFlow(contactId: String): Flow<Message?>

    @Query("SELECT COUNT(*) FROM messages WHERE contactId = :contactId AND isOutgoing = 0 AND status != 'READ'")
    suspend fun getUnreadCount(contactId: String): Int

    @Query("SELECT COUNT(*) FROM messages WHERE contactId = :contactId AND isOutgoing = 0 AND status != 'READ'")
    fun getUnreadCountFlow(contactId: String): Flow<Int>

    @Query("SELECT * FROM messages WHERE contactId = :contactId AND isOutgoing = 0 AND status != 'READ'")
    suspend fun getUnreadIncomingMessages(contactId: String): List<Message>

    @Query("SELECT * FROM messages WHERE fileId = :fileId")
    suspend fun getByFileId(fileId: String): Message?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(message: Message)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(messages: List<Message>)

    @Update
    suspend fun update(message: Message)

    @Query("UPDATE messages SET status = :status WHERE id = :messageId")
    suspend fun updateStatus(messageId: String, status: MessageStatus)

    @Query("UPDATE messages SET status = 'DELIVERED' WHERE id = :messageId")
    suspend fun markDelivered(messageId: String)

    @Query("UPDATE messages SET status = 'READ' WHERE id = :messageId")
    suspend fun markRead(messageId: String)

    @Query("UPDATE messages SET status = 'READ' WHERE contactId = :contactId AND isOutgoing = 0 AND status != 'READ'")
    suspend fun markAllRead(contactId: String)

    @Query("UPDATE messages SET status = 'FAILED' WHERE id = :messageId")
    suspend fun markFailed(messageId: String)

    @Query("DELETE FROM messages WHERE id = :messageId")
    suspend fun delete(messageId: String)

    @Query("DELETE FROM messages WHERE contactId = :contactId")
    suspend fun deleteAllForContact(contactId: String)

    @Query("DELETE FROM messages")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM messages WHERE contactId = :contactId")
    suspend fun getMessageCount(contactId: String): Int

    @Query("SELECT COUNT(*) FROM messages")
    suspend fun getTotalMessageCount(): Int
}
