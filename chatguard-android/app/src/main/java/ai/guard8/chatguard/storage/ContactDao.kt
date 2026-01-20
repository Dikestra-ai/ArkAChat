package ai.guard8.chatguard.storage

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import ai.guard8.chatguard.model.Contact
import kotlinx.coroutines.flow.Flow

@Dao
interface ContactDao {

    @Query("SELECT * FROM contacts WHERE isBlocked = 0 ORDER BY COALESCE(lastMessageAt, 0) DESC")
    fun getAllContacts(): Flow<List<Contact>>

    @Query("SELECT * FROM contacts ORDER BY COALESCE(lastMessageAt, 0) DESC")
    fun getAllContactsIncludingBlocked(): Flow<List<Contact>>

    @Query("SELECT * FROM contacts WHERE id = :contactId")
    suspend fun getById(contactId: String): Contact?

    @Query("SELECT * FROM contacts WHERE id = :contactId")
    fun getByIdFlow(contactId: String): Flow<Contact?>

    @Query("SELECT * FROM contacts WHERE simplexQueueUri = :queueUri")
    suspend fun getBySimplexQueueUri(queueUri: String): Contact?

    @Query("SELECT * FROM contacts WHERE simplexQueueUri LIKE '%' || :serverHost || '%'")
    suspend fun getByServerHost(serverHost: String): List<Contact>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(contact: Contact)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(contacts: List<Contact>)

    @Update
    suspend fun update(contact: Contact)

    @Query("UPDATE contacts SET lastMessageAt = :timestamp WHERE id = :contactId")
    suspend fun updateLastMessageAt(contactId: String, timestamp: Long)

    @Query("UPDATE contacts SET displayName = :name WHERE id = :contactId")
    suspend fun updateDisplayName(contactId: String, name: String)

    @Query("UPDATE contacts SET isBlocked = :blocked WHERE id = :contactId")
    suspend fun updateBlocked(contactId: String, blocked: Boolean)

    @Query("UPDATE contacts SET avatarPath = :path WHERE id = :contactId")
    suspend fun updateAvatarPath(contactId: String, path: String?)

    @Query("DELETE FROM contacts WHERE id = :contactId")
    suspend fun delete(contactId: String)

    @Query("DELETE FROM contacts")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM contacts WHERE isBlocked = 0")
    suspend fun getContactCount(): Int

    @Query("SELECT COUNT(*) FROM contacts")
    suspend fun getTotalContactCount(): Int
}
