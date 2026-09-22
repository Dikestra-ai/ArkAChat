package ai.dikestra.arkachat.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

enum class MemberRole {
    ADMIN,
    MEMBER
}

@Entity(tableName = "groups")
data class Group(
    @PrimaryKey
    val id: String,
    val name: String,
    val createdAt: Long,
    val createdBy: String,           // Contact ID of creator (empty string if self)
    val avatarPath: String? = null,
    val currentKeyId: String,        // Current group key identifier
    val keyRotationCount: Int = 0,
    val lastMessageAt: Long? = null,
    // Base64 of X.509 SPKI (DER) for the group admin's ECDSA P-256 public key.
    // Null until the group invite is received (or self-generated on creation).
    val adminPublicKey: String? = null
)

@Entity(
    tableName = "group_members",
    primaryKeys = ["groupId", "contactId"]
)
data class GroupMember(
    val groupId: String,
    val contactId: String,           // Empty string for self
    val displayName: String,         // Cached display name
    val role: MemberRole,
    val joinedAt: Long,
    val addedBy: String              // Contact ID who added this member
)

@Entity(tableName = "group_keys")
data class GroupKey(
    @PrimaryKey
    val id: String,
    val groupId: String,
    val encryptedKey: ByteArray,     // Key encrypted with device master key
    val createdAt: Long,
    val rotationNumber: Int
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as GroupKey
        return id == other.id &&
                groupId == other.groupId &&
                encryptedKey.contentEquals(other.encryptedKey) &&
                createdAt == other.createdAt &&
                rotationNumber == other.rotationNumber
    }

    override fun hashCode(): Int {
        var result = id.hashCode()
        result = 31 * result + groupId.hashCode()
        result = 31 * result + encryptedKey.contentHashCode()
        result = 31 * result + createdAt.hashCode()
        result = 31 * result + rotationNumber
        return result
    }
}

data class GroupWithMembers(
    val group: Group,
    val members: List<GroupMember>,
    val unreadCount: Int = 0
)

@Serializable
data class GroupMessageEnvelope(
    val type: GroupMessageType,
    val groupId: String,
    val senderId: String,            // Contact ID of sender
    val messageId: String,
    val timestamp: Long,
    val keyId: String,               // Which group key version
    val content: String? = null,
    val fileId: String? = null,
    val replyToId: String? = null,
    val metadata: Map<String, String>? = null,
    // Present on MEMBER_ADDED, MEMBER_REMOVED, KEY_ROTATION, GROUP_INFO_UPDATE, ADMIN_CHANGE.
    // Base64 of 64-byte raw ECDSA P-256 signature (r || s) over the canonical signing input.
    val adminSignature: String? = null,
    // Present only in messages that (re-)distribute the admin public key:
    // group creation invite, KEY_ROTATION, ADMIN_CHANGE.
    // Base64 of X.509 SPKI (DER) of the admin's ECDSA P-256 public key.
    val adminPublicKey: String? = null
)

enum class GroupMessageType {
    TEXT,
    FILE,
    MEMBER_ADDED,
    MEMBER_REMOVED,
    KEY_ROTATION,
    GROUP_INFO_UPDATE,
    ADMIN_CHANGE,
    DELIVERY_RECEIPT,
    READ_RECEIPT
}
