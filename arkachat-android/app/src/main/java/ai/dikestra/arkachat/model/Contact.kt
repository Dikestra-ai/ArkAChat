package ai.dikestra.arkachat.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "contacts")
data class Contact(
    @PrimaryKey
    val id: String,
    val displayName: String,
    val simplexQueueUri: String,     // SMP queue URI for messaging
    val isInitiator: Boolean,        // Whether we initiated the connection
    val createdAt: Long,
    val lastMessageAt: Long? = null,
    val avatarPath: String? = null,
    val isBlocked: Boolean = false
)

data class ContactWithLastMessage(
    val contact: Contact,
    val lastMessage: Message?,
    val unreadCount: Int
)
