package ai.guard8.chatguard.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

enum class MessageStatus {
    SENDING,
    SENT,
    DELIVERED,
    READ,
    FAILED
}

enum class MediaType {
    IMAGE,
    VIDEO,
    FILE,
    VOICE
}

@Entity(
    tableName = "messages",
    foreignKeys = [
        ForeignKey(
            entity = Contact::class,
            parentColumns = ["id"],
            childColumns = ["contactId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("contactId"), Index("timestamp"), Index("groupId")]
)
data class Message(
    @PrimaryKey
    val id: String,
    val contactId: String,            // For 1:1 chats; empty for group messages
    val content: String,
    val timestamp: Long,
    val isOutgoing: Boolean,
    val status: MessageStatus = MessageStatus.SENT,
    val fileId: String? = null,       // Reference to encrypted file
    val replyToId: String? = null,    // Reply to another message
    val mediaType: MediaType? = null,
    val mediaPath: String? = null,    // Legacy - use fileId instead
    val groupId: String? = null,      // For group messages
    val senderContactId: String? = null // Sender in group chat (null = self)
)
