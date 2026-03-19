package ai.guard8.chatguard.bridge

import ai.guard8.chatguard.crypto.GroupKeyManager
import ai.guard8.chatguard.crypto.ShieldCrypto
import ai.guard8.chatguard.model.Contact
import ai.guard8.chatguard.model.Group
import ai.guard8.chatguard.model.GroupKey
import ai.guard8.chatguard.model.GroupMember
import ai.guard8.chatguard.model.GroupMessageEnvelope
import ai.guard8.chatguard.model.GroupMessageType
import ai.guard8.chatguard.model.MemberRole
import ai.guard8.chatguard.model.Message
import ai.guard8.chatguard.model.MessageStatus
import ai.guard8.chatguard.storage.ContactDao
import ai.guard8.chatguard.storage.GroupDao
import ai.guard8.chatguard.storage.MessageDao
import ai.guard8.chatguard.network.ConnectionState
import ai.guard8.chatguard.network.SMPInvitation
import ai.guard8.chatguard.network.SMPMessage
import ai.guard8.chatguard.network.SMPQueueAddress
import ai.guard8.chatguard.network.SimpleXClient
import ai.guard8.chatguard.storage.EncryptedFile
import ai.guard8.chatguard.storage.EncryptedFileStorage
import ai.guard8.chatguard.storage.FileMetadata
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

/**
 * Message envelope for Shield-encrypted messages over SimpleX.
 */
@Serializable
data class MessageEnvelope(
    val type: MessageType,
    val messageId: String,
    val timestamp: Long,
    val content: String? = null,           // For text messages
    val fileId: String? = null,            // For file messages
    val fileMetadata: FileMetadataDto? = null,
    val replyToId: String? = null
)

@Serializable
enum class MessageType {
    TEXT,
    FILE,
    FILE_REQUEST,  // Request encrypted file download
    DELIVERY_RECEIPT,
    READ_RECEIPT,
    TYPING,
    DUMMY
}

@Serializable
data class FileMetadataDto(
    val name: String,
    val mimeType: String,
    val size: Long
)

/**
 * Bridge connecting Shield encryption with SimpleX messaging.
 *
 * This is the core integration layer that:
 * - Encrypts messages with Shield before sending via SimpleX
 * - Decrypts messages received from SimpleX with Shield
 * - Handles QR-based contact pairing
 * - Manages encrypted file transfers
 * - Supports group messaging with shared keys
 */
class ShieldSimplexBridge(
    private val shieldCrypto: ShieldCrypto,
    private val simplexClient: SimpleXClient,
    private val fileStorage: EncryptedFileStorage,
    private val messageDao: MessageDao,
    private val contactDao: ContactDao,
    private val groupDao: GroupDao? = null,
    private val groupKeyManager: GroupKeyManager? = null
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val json = Json { ignoreUnknownKeys = true }

    // Contact queue mappings
    private val contactQueues = mutableMapOf<String, SMPQueueAddress>()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    /**
     * Initialize the bridge - connect to SimpleX and start listening.
     */
    fun initialize() {
        // Connect to SMP servers
        simplexClient.connect()

        // Forward connection state
        scope.launch {
            simplexClient.connectionState.collect { state ->
                _connectionState.value = state
            }
        }

        // Listen for incoming messages
        scope.launch {
            simplexClient.receiveMessages().collect { smpMessage ->
                handleIncomingMessage(smpMessage)
            }
        }
    }

    /**
     * Shutdown the bridge.
     */
    fun shutdown() {
        simplexClient.disconnect()
    }

    // ==================== Contact Pairing ====================

    /**
     * Create an invitation for a new contact (generates QR code data).
     *
     * @param displayName Your display name to show to the contact
     * @return JSON string for QR code
     */
    suspend fun createInvitation(displayName: String): String {
        // Generate Shield shared key for E2E encryption
        val tempContactId = "pending_${UUID.randomUUID()}"
        val shieldKey = shieldCrypto.generateSharedKey(tempContactId)

        // Create SimpleX invitation
        val invitation = simplexClient.createInvitation(displayName, shieldKey)

        // Store pending invitation
        // In production, persist this to handle app restarts

        return invitation.toJson()
    }

    /**
     * Accept an invitation from a scanned QR code.
     *
     * @param qrData JSON string from QR code
     * @return The new contact
     */
    suspend fun acceptInvitation(qrData: String): Contact {
        val invitation = SMPInvitation.fromJson(qrData)
            ?: throw IllegalArgumentException("Invalid invitation QR code")

        // Accept SimpleX connection
        val queue = simplexClient.acceptInvitation(invitation)

        // Import Shield key for E2E encryption
        val contactId = UUID.randomUUID().toString()
        shieldCrypto.importSharedKey(contactId, invitation.shieldKey)

        // Create contact
        val contact = Contact(
            id = contactId,
            displayName = invitation.displayName,
            simplexQueueUri = queue.toUri(),
            isInitiator = false,
            createdAt = System.currentTimeMillis()
        )

        // Save contact
        contactDao.insert(contact)

        // Store queue mapping
        contactQueues[contactId] = queue

        return contact
    }

    // ==================== Messaging ====================

    /**
     * Send a text message to a contact.
     */
    suspend fun sendTextMessage(contactId: String, text: String): Message {
        val contact = contactDao.getById(contactId)
            ?: throw IllegalStateException("Contact not found: $contactId")

        val messageId = UUID.randomUUID().toString()
        val envelope = MessageEnvelope(
            type = MessageType.TEXT,
            messageId = messageId,
            timestamp = System.currentTimeMillis(),
            content = text
        )

        // Encrypt with Shield
        val envelopeJson = json.encodeToString(envelope)
        val encrypted = shieldCrypto.encryptMessage(contactId, contact.isInitiator, envelopeJson)

        // Send via SimpleX
        val queue = getQueueForContact(contact)
        simplexClient.sendMessage(queue, encrypted)

        // Save message locally
        val message = Message(
            id = messageId,
            contactId = contactId,
            content = text,
            isOutgoing = true,
            timestamp = envelope.timestamp,
            status = MessageStatus.SENT
        )
        messageDao.insert(message)

        return message
    }

    /**
     * Send a file to a contact.
     *
     * @param contactId Contact ID
     * @param file File to send
     * @param metadata Optional metadata override
     * @return The message and encrypted file reference
     */
    suspend fun sendFile(
        contactId: String,
        file: File,
        metadata: FileMetadata? = null
    ): Pair<Message, EncryptedFile> {
        val contact = contactDao.getById(contactId)
            ?: throw IllegalStateException("Contact not found: $contactId")

        // Encrypt and store file
        val fileMetadata = metadata ?: FileMetadata(
            originalName = file.name,
            mimeType = guessMimeType(file.name),
            originalSize = file.length()
        )
        val encryptedFile = fileStorage.saveEncrypted(contactId, file, fileMetadata)

        // Create message envelope with file info
        val messageId = UUID.randomUUID().toString()
        val envelope = MessageEnvelope(
            type = MessageType.FILE,
            messageId = messageId,
            timestamp = System.currentTimeMillis(),
            fileId = encryptedFile.id,
            fileMetadata = FileMetadataDto(
                name = fileMetadata.originalName,
                mimeType = fileMetadata.mimeType,
                size = fileMetadata.originalSize
            )
        )

        // Encrypt envelope with Shield
        val envelopeJson = json.encodeToString(envelope)
        val encrypted = shieldCrypto.encryptMessage(contactId, contact.isInitiator, envelopeJson)

        // Send via SimpleX
        val queue = getQueueForContact(contact)
        simplexClient.sendMessage(queue, encrypted)

        // Save message locally
        val message = Message(
            id = messageId,
            contactId = contactId,
            content = "[File: ${fileMetadata.originalName}]",
            fileId = encryptedFile.id,
            isOutgoing = true,
            timestamp = envelope.timestamp,
            status = MessageStatus.SENT
        )
        messageDao.insert(message)

        return Pair(message, encryptedFile)
    }

    /**
     * Request to download an encrypted file from a contact.
     */
    suspend fun requestFileDownload(contactId: String, fileId: String) {
        val contact = contactDao.getById(contactId)
            ?: throw IllegalStateException("Contact not found: $contactId")

        val envelope = MessageEnvelope(
            type = MessageType.FILE_REQUEST,
            messageId = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            fileId = fileId
        )

        val envelopeJson = json.encodeToString(envelope)
        val encrypted = shieldCrypto.encryptMessage(contactId, contact.isInitiator, envelopeJson)

        val queue = getQueueForContact(contact)
        simplexClient.sendMessage(queue, encrypted)
    }

    /**
     * Send delivery receipt for a message.
     */
    suspend fun sendDeliveryReceipt(contactId: String, messageId: String) {
        val contact = contactDao.getById(contactId)
            ?: throw IllegalStateException("Contact not found: $contactId")

        val envelope = MessageEnvelope(
            type = MessageType.DELIVERY_RECEIPT,
            messageId = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            replyToId = messageId
        )

        val envelopeJson = json.encodeToString(envelope)
        val encrypted = shieldCrypto.encryptMessage(contactId, contact.isInitiator, envelopeJson)

        val queue = getQueueForContact(contact)
        simplexClient.sendMessage(queue, encrypted)
    }

    /**
     * Send read receipt for a message.
     * Called when the user views an incoming message.
     */
    suspend fun sendReadReceipt(contactId: String, messageId: String) {
        val contact = contactDao.getById(contactId)
            ?: throw IllegalStateException("Contact not found: $contactId")

        val envelope = MessageEnvelope(
            type = MessageType.READ_RECEIPT,
            messageId = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            replyToId = messageId
        )

        val envelopeJson = json.encodeToString(envelope)
        val encrypted = shieldCrypto.encryptMessage(contactId, contact.isInitiator, envelopeJson)

        val queue = getQueueForContact(contact)
        simplexClient.sendMessage(queue, encrypted)
    }

    /**
     * Send read receipts for multiple messages.
     * More efficient than sending individual receipts.
     */
    suspend fun sendReadReceipts(contactId: String, messageIds: List<String>) {
        for (messageId in messageIds) {
            sendReadReceipt(contactId, messageId)
        }
    }

    /**
     * Send read receipt for a group message.
     */
    suspend fun sendGroupReadReceipt(groupId: String, messageId: String) {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        requireNotNull(groupKeyManager) { "GroupKeyManager required for group messaging" }

        val group = groupDao.getGroupById(groupId)
            ?: throw IllegalStateException("Group not found: $groupId")

        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.READ_RECEIPT,
            groupId = groupId,
            senderId = "", // Self
            messageId = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            keyId = group.currentKeyId,
            replyToId = messageId
        )

        val envelopeJson = json.encodeToString(envelope)
        val encrypted = groupKeyManager.encryptGroupMessage(groupId, envelopeJson.toByteArray())

        // Send to message sender only (not all members)
        val originalMessage = messageDao.getById(messageId) ?: return
        val senderContactId = originalMessage.senderContactId ?: return

        val contact = contactDao.getById(senderContactId) ?: return

        val pairwiseEnvelope = MessageEnvelope(
            type = MessageType.TEXT,
            messageId = envelope.messageId,
            timestamp = envelope.timestamp,
            content = "GROUP:$groupId:${group.currentKeyId}:${android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP)}"
        )

        val pairwiseJson = json.encodeToString(pairwiseEnvelope)
        val pairwiseEncrypted = shieldCrypto.encryptMessage(
            senderContactId,
            contact.isInitiator,
            pairwiseJson
        )

        val queue = getQueueForContact(contact)
        simplexClient.sendMessage(queue, pairwiseEncrypted)
    }

    /**
     * Get messages for a contact.
     */
    fun getMessages(contactId: String): Flow<List<Message>> {
        return messageDao.getMessagesForContact(contactId)
    }

    // ==================== Encrypted File Access ====================

    /**
     * Download a received file in decrypted form.
     */
    suspend fun downloadFileDecrypted(contactId: String, fileId: String): ByteArray {
        val encryptedFile = EncryptedFile(
            id = fileId,
            path = "", // Will be resolved by storage
            encryptedSize = 0,
            contactId = contactId
        )
        return fileStorage.downloadDecrypted(encryptedFile)
    }

    /**
     * Download a received file in encrypted form (for backup).
     */
    suspend fun downloadFileEncrypted(contactId: String, fileId: String): ByteArray {
        val encryptedFile = EncryptedFile(
            id = fileId,
            path = "",
            encryptedSize = 0,
            contactId = contactId
        )
        return fileStorage.downloadEncrypted(encryptedFile)
    }

    // ==================== Private Helpers ====================

    private suspend fun handleIncomingMessage(smpMessage: SMPMessage) {
        // Find contact by queue
        val contact = findContactByQueue(smpMessage.queueAddress)
        if (contact == null) {
            // Unknown sender - possibly pending invitation
            return
        }

        try {
            // Decrypt with Shield
            val decrypted = shieldCrypto.decryptMessage(
                contact.id,
                contact.isInitiator,
                smpMessage.ciphertext
            )

            // Parse envelope
            val envelope = json.decodeFromString<MessageEnvelope>(decrypted)

            // Handle based on type
            when (envelope.type) {
                MessageType.TEXT -> handleTextMessage(contact, envelope)
                MessageType.FILE -> handleFileMessage(contact, envelope, smpMessage)
                MessageType.FILE_REQUEST -> handleFileRequest(contact, envelope)
                MessageType.DELIVERY_RECEIPT -> handleDeliveryReceipt(envelope)
                MessageType.READ_RECEIPT -> handleReadReceipt(envelope)
                MessageType.TYPING -> { /* Handle typing indicator */ }
                MessageType.DUMMY -> { /* Silently discard dummy traffic */ }
            }

            // Acknowledge message
            simplexClient.acknowledgeMessage(smpMessage.queueAddress, smpMessage.msgId)

            // Send delivery receipt
            sendDeliveryReceipt(contact.id, envelope.messageId)

        } catch (e: Exception) {
            // Decryption or parsing failed
            e.printStackTrace()
        }
    }

    private suspend fun handleTextMessage(contact: Contact, envelope: MessageEnvelope) {
        val content = envelope.content ?: ""

        // Check for group-related messages
        // Format: GROUP:groupId:keyId:base64_encrypted
        if (content.startsWith("GROUP:")) {
            val parts = content.removePrefix("GROUP:").split(":", limit = 3)
            if (parts.size == 3) {
                val (groupId, keyId, base64Encrypted) = parts
                handleGroupMessage(contact, groupId, keyId, base64Encrypted)
                return
            }
        }

        // Format: GROUP_KEY:json_data
        if (content.startsWith("GROUP_KEY:")) {
            handleGroupKeyDistribution(contact, content.removePrefix("GROUP_KEY:"))
            return
        }

        // Regular 1:1 text message
        val message = Message(
            id = envelope.messageId,
            contactId = contact.id,
            content = content,
            isOutgoing = false,
            timestamp = envelope.timestamp,
            status = MessageStatus.DELIVERED
        )
        messageDao.insert(message)
    }

    private suspend fun handleFileMessage(
        contact: Contact,
        envelope: MessageEnvelope,
        smpMessage: SMPMessage
    ) {
        // The file data would come in a separate message or be embedded
        // For now, create a placeholder message
        val message = Message(
            id = envelope.messageId,
            contactId = contact.id,
            content = "[File: ${envelope.fileMetadata?.name ?: "Unknown"}]",
            fileId = envelope.fileId,
            isOutgoing = false,
            timestamp = envelope.timestamp,
            status = MessageStatus.DELIVERED
        )
        messageDao.insert(message)
    }

    private suspend fun handleFileRequest(contact: Contact, envelope: MessageEnvelope) {
        val fileId = envelope.fileId ?: return

        // Get encrypted file and send it
        try {
            val encryptedData = fileStorage.downloadEncrypted(
                EncryptedFile(
                    id = fileId,
                    path = "",
                    encryptedSize = 0,
                    contactId = contact.id
                )
            )

            // Send file data via SimpleX
            // In production, this would be chunked for large files
            val queue = getQueueForContact(contact)
            simplexClient.sendMessage(queue, encryptedData)

        } catch (e: Exception) {
            // File not found or other error
            e.printStackTrace()
        }
    }

    private suspend fun handleDeliveryReceipt(envelope: MessageEnvelope) {
        envelope.replyToId?.let { originalMessageId ->
            messageDao.updateStatus(originalMessageId, MessageStatus.DELIVERED)
        }
    }

    private suspend fun handleReadReceipt(envelope: MessageEnvelope) {
        envelope.replyToId?.let { originalMessageId ->
            messageDao.updateStatus(originalMessageId, MessageStatus.READ)
        }
    }

    private suspend fun findContactByQueue(queue: SMPQueueAddress): Contact? {
        val queueUri = queue.toUri()
        return contactDao.getBySimplexQueueUri(queueUri)
    }

    private suspend fun getQueueForContact(contact: Contact): SMPQueueAddress {
        // Check cache
        contactQueues[contact.id]?.let { return it }

        // Parse from stored URI
        val queue = SMPQueueAddress.fromUri(contact.simplexQueueUri)
            ?: throw IllegalStateException("Invalid queue URI for contact: ${contact.id}")

        contactQueues[contact.id] = queue
        return queue
    }

    private fun guessMimeType(filename: String): String {
        val extension = filename.substringAfterLast('.', "").lowercase()
        return when (extension) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "mp4" -> "video/mp4"
            "webm" -> "video/webm"
            "mp3" -> "audio/mpeg"
            "ogg" -> "audio/ogg"
            "pdf" -> "application/pdf"
            "txt" -> "text/plain"
            "json" -> "application/json"
            else -> "application/octet-stream"
        }
    }

    // ==================== Group Messaging ====================

    /**
     * Create a new group with initial members.
     *
     * @param name Group name
     * @param memberContactIds List of contact IDs to add as members
     * @return The created group
     */
    suspend fun createGroup(name: String, memberContactIds: List<String>): Group {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        requireNotNull(groupKeyManager) { "GroupKeyManager required for group messaging" }

        val groupId = UUID.randomUUID().toString()

        // Generate group key
        val groupKey = groupKeyManager.createGroupKey(groupId)

        // Create group
        val group = Group(
            id = groupId,
            name = name,
            createdAt = System.currentTimeMillis(),
            createdBy = "", // Empty string = self
            currentKeyId = groupKey.id,
            keyRotationCount = 0
        )

        // Create member list (self + invited members)
        val members = mutableListOf<GroupMember>()

        // Add self as admin
        members.add(GroupMember(
            groupId = groupId,
            contactId = "", // Empty = self
            displayName = "You",
            role = MemberRole.ADMIN,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        ))

        // Add invited members
        for (contactId in memberContactIds) {
            val contact = contactDao.getById(contactId) ?: continue
            members.add(GroupMember(
                groupId = groupId,
                contactId = contactId,
                displayName = contact.displayName,
                role = MemberRole.MEMBER,
                joinedAt = System.currentTimeMillis(),
                addedBy = ""
            ))
        }

        // Save group with members and key
        groupDao.createGroupWithMembers(group, members, groupKey)

        // Distribute group key to all members
        val decryptedKey = groupKeyManager.getDecryptedCurrentKey(groupId)!!
        distributeGroupKey(groupId, decryptedKey, groupKey.id, members, 0)

        return group
    }

    /**
     * Send a text message to a group.
     */
    suspend fun sendGroupMessage(groupId: String, text: String): Message {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        requireNotNull(groupKeyManager) { "GroupKeyManager required for group messaging" }

        val group = groupDao.getGroupById(groupId)
            ?: throw IllegalStateException("Group not found: $groupId")

        val messageId = UUID.randomUUID().toString()
        val timestamp = System.currentTimeMillis()

        // Create group message envelope
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.TEXT,
            groupId = groupId,
            senderId = "", // Empty = self
            messageId = messageId,
            timestamp = timestamp,
            keyId = group.currentKeyId,
            content = text
        )

        // Encrypt with group key
        val envelopeJson = json.encodeToString(envelope)
        val encrypted = groupKeyManager.encryptGroupMessage(groupId, envelopeJson.toByteArray())

        // Send to all members via their pairwise channels
        val members = groupDao.getMembers(groupId)
        for (member in members) {
            if (member.contactId.isEmpty()) continue // Skip self

            val contact = contactDao.getById(member.contactId) ?: continue

            // Wrap in pairwise envelope and send
            val pairwiseEnvelope = MessageEnvelope(
                type = MessageType.TEXT, // Reuse TEXT type with special prefix
                messageId = messageId,
                timestamp = timestamp,
                // Format: GROUP:groupId:keyId:base64_encrypted
                content = "GROUP:$groupId:${group.currentKeyId}:${android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP)}"
            )

            val pairwiseJson = json.encodeToString(pairwiseEnvelope)
            val pairwiseEncrypted = shieldCrypto.encryptMessage(
                member.contactId,
                contact.isInitiator,
                pairwiseJson
            )

            val queue = getQueueForContact(contact)
            simplexClient.sendMessage(queue, pairwiseEncrypted)
        }

        // Save message locally
        val message = Message(
            id = messageId,
            contactId = "", // Empty for group messages
            groupId = groupId,
            senderContactId = null, // null = self
            content = text,
            isOutgoing = true,
            timestamp = timestamp,
            status = MessageStatus.SENT
        )
        messageDao.insert(message)

        // Update group's last message time
        groupDao.updateLastMessageAt(groupId, timestamp)

        return message
    }

    /**
     * Check if the current user is an admin in the specified group.
     */
    suspend fun isAdmin(groupId: String): Boolean {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        val selfMember = groupDao.getMember(groupId, "") // Empty string = self
        return selfMember?.role == MemberRole.ADMIN
    }

    /**
     * Add a member to an existing group.
     * Requires admin permission.
     */
    suspend fun addGroupMember(groupId: String, contactId: String): GroupMember {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        requireNotNull(groupKeyManager) { "GroupKeyManager required for group messaging" }

        // Check admin permission
        if (!isAdmin(groupId)) {
            throw SecurityException("Only admins can add members to the group")
        }

        val group = groupDao.getGroupById(groupId)
            ?: throw IllegalStateException("Group not found: $groupId")
        val contact = contactDao.getById(contactId)
            ?: throw IllegalStateException("Contact not found: $contactId")

        // Create member
        val member = GroupMember(
            groupId = groupId,
            contactId = contactId,
            displayName = contact.displayName,
            role = MemberRole.MEMBER,
            joinedAt = System.currentTimeMillis(),
            addedBy = "" // Self
        )

        groupDao.insertMember(member)

        // Send current group key to new member
        val decryptedKey = groupKeyManager.getDecryptedCurrentKey(groupId)!!
        val encryptedKey = groupKeyManager.encryptKeyForMember(
            decryptedKey,
            contactId,
            contact.isInitiator
        )

        // Send key distribution message
        sendGroupKeyToMember(contact, groupId, group.name, encryptedKey, group.currentKeyId, group.keyRotationCount)

        // Notify other members
        sendGroupSystemMessage(groupId, GroupMessageType.MEMBER_ADDED, mapOf("memberId" to contactId))

        return member
    }

    /**
     * Remove a member from a group (with key rotation).
     * Requires admin permission.
     */
    suspend fun removeGroupMember(groupId: String, contactId: String) {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        requireNotNull(groupKeyManager) { "GroupKeyManager required for group messaging" }

        // Check admin permission
        if (!isAdmin(groupId)) {
            throw SecurityException("Only admins can remove members from the group")
        }

        val group = groupDao.getGroupById(groupId)
            ?: throw IllegalStateException("Group not found: $groupId")

        // Generate new key
        val newKey = groupKeyManager.rotateKey(group)

        // Remove member and update key atomically
        groupDao.removeMemberAndRotateKey(groupId, contactId, newKey)

        // Distribute new key to remaining members
        val members = groupDao.getMembers(groupId)
        val decryptedKey = groupKeyManager.getDecryptedCurrentKey(groupId)!!
        distributeGroupKey(groupId, decryptedKey, newKey.id, members, newKey.rotationNumber)

        // Notify members of removal
        sendGroupSystemMessage(groupId, GroupMessageType.MEMBER_REMOVED, mapOf("memberId" to contactId))
    }

    /**
     * Leave a group voluntarily.
     */
    suspend fun leaveGroup(groupId: String) {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }

        // Notify other members
        sendGroupSystemMessage(groupId, GroupMessageType.MEMBER_REMOVED, mapOf("memberId" to ""))

        // Remove self from group
        groupDao.removeMember(groupId, "")

        // Delete local group data (optional - could keep for history)
        // groupDao.deleteGroup(...)
    }

    /**
     * Update group name.
     * Requires admin permission.
     */
    suspend fun updateGroupName(groupId: String, newName: String) {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }

        // Check admin permission
        if (!isAdmin(groupId)) {
            throw SecurityException("Only admins can update group settings")
        }

        groupDao.updateGroupName(groupId, newName)

        // Notify all members
        sendGroupSystemMessage(groupId, GroupMessageType.GROUP_INFO_UPDATE, mapOf("name" to newName))
    }

    /**
     * Update group avatar.
     * Requires admin permission.
     */
    suspend fun updateGroupAvatar(groupId: String, avatarPath: String?) {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }

        // Check admin permission
        if (!isAdmin(groupId)) {
            throw SecurityException("Only admins can update group settings")
        }

        groupDao.updateGroupAvatar(groupId, avatarPath)

        // Notify all members
        val metadata = if (avatarPath != null) {
            mapOf("avatarPath" to avatarPath)
        } else {
            mapOf("avatarPath" to "")
        }
        sendGroupSystemMessage(groupId, GroupMessageType.GROUP_INFO_UPDATE, metadata)
    }

    /**
     * Promote a member to admin.
     * Requires admin permission.
     */
    suspend fun promoteToAdmin(groupId: String, contactId: String) {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }

        // Check admin permission
        if (!isAdmin(groupId)) {
            throw SecurityException("Only admins can promote members")
        }

        groupDao.updateMemberRole(groupId, contactId, MemberRole.ADMIN)

        // Notify all members
        sendGroupSystemMessage(groupId, GroupMessageType.ADMIN_CHANGE, mapOf(
            "memberId" to contactId,
            "role" to "ADMIN"
        ))
    }

    /**
     * Demote an admin to regular member.
     * Requires admin permission.
     */
    suspend fun demoteToMember(groupId: String, contactId: String) {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }

        // Check admin permission
        if (!isAdmin(groupId)) {
            throw SecurityException("Only admins can demote members")
        }

        // Cannot demote self if you're the only admin
        val admins = groupDao.getMembersByRole(groupId, MemberRole.ADMIN)
        if (admins.size <= 1 && contactId.isEmpty()) {
            throw IllegalStateException("Cannot demote yourself when you're the only admin")
        }

        groupDao.updateMemberRole(groupId, contactId, MemberRole.MEMBER)

        // Notify all members
        sendGroupSystemMessage(groupId, GroupMessageType.ADMIN_CHANGE, mapOf(
            "memberId" to contactId,
            "role" to "MEMBER"
        ))
    }

    /**
     * Get all groups.
     */
    fun getGroups(): Flow<List<Group>> {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        return groupDao.getAllGroups()
    }

    /**
     * Get messages for a group.
     */
    fun getGroupMessages(groupId: String): Flow<List<Message>> {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        return groupDao.getGroupMessages(groupId)
    }

    /**
     * Get members of a group.
     */
    fun getGroupMembers(groupId: String): Flow<List<GroupMember>> {
        requireNotNull(groupDao) { "GroupDao required for group messaging" }
        return groupDao.getMembersFlow(groupId)
    }

    // ==================== Private Group Helpers ====================

    private suspend fun distributeGroupKey(
        groupId: String,
        groupKey: ByteArray,
        keyId: String,
        members: List<GroupMember>,
        rotationNumber: Int
    ) {
        val group = groupDao!!.getGroupById(groupId) ?: return

        for (member in members) {
            if (member.contactId.isEmpty()) continue // Skip self

            val contact = contactDao.getById(member.contactId) ?: continue

            // Encrypt key for this member
            val encryptedKey = groupKeyManager!!.encryptKeyForMember(
                groupKey,
                member.contactId,
                contact.isInitiator
            )

            // Send key via pairwise channel
            sendGroupKeyToMember(contact, groupId, group.name, encryptedKey, keyId, rotationNumber)
        }
    }

    private suspend fun sendGroupKeyToMember(
        contact: Contact,
        groupId: String,
        groupName: String,
        encryptedKey: ByteArray,
        keyId: String,
        rotationNumber: Int
    ) {
        // Create a special message for key distribution
        val keyData = mapOf(
            "groupId" to groupId,
            "groupName" to groupName,
            "keyId" to keyId,
            "rotationNumber" to rotationNumber.toString(),
            "encryptedKey" to android.util.Base64.encodeToString(encryptedKey, android.util.Base64.NO_WRAP)
        )

        val envelope = MessageEnvelope(
            type = MessageType.TEXT,
            messageId = UUID.randomUUID().toString(),
            timestamp = System.currentTimeMillis(),
            content = "GROUP_KEY:${json.encodeToString(keyData)}"
        )

        val envelopeJson = json.encodeToString(envelope)
        val encrypted = shieldCrypto.encryptMessage(
            contact.id,
            contact.isInitiator,
            envelopeJson
        )

        val queue = getQueueForContact(contact)
        simplexClient.sendMessage(queue, encrypted)
    }

    private suspend fun sendGroupSystemMessage(
        groupId: String,
        type: GroupMessageType,
        metadata: Map<String, String>
    ) {
        requireNotNull(groupDao)
        requireNotNull(groupKeyManager)

        val group = groupDao.getGroupById(groupId) ?: return
        val messageId = UUID.randomUUID().toString()
        val timestamp = System.currentTimeMillis()

        val envelope = GroupMessageEnvelope(
            type = type,
            groupId = groupId,
            senderId = "",
            messageId = messageId,
            timestamp = timestamp,
            keyId = group.currentKeyId,
            metadata = metadata
        )

        val envelopeJson = json.encodeToString(envelope)
        val encrypted = groupKeyManager.encryptGroupMessage(groupId, envelopeJson.toByteArray())

        // Send to all members
        val members = groupDao.getMembers(groupId)
        for (member in members) {
            if (member.contactId.isEmpty()) continue

            val contact = contactDao.getById(member.contactId) ?: continue

            val pairwiseEnvelope = MessageEnvelope(
                type = MessageType.TEXT,
                messageId = messageId,
                timestamp = timestamp,
                // Format: GROUP:groupId:keyId:base64_encrypted
                content = "GROUP:$groupId:${group.currentKeyId}:${android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP)}"
            )

            val pairwiseJson = json.encodeToString(pairwiseEnvelope)
            val pairwiseEncrypted = shieldCrypto.encryptMessage(
                member.contactId,
                contact.isInitiator,
                pairwiseJson
            )

            val queue = getQueueForContact(contact)
            simplexClient.sendMessage(queue, pairwiseEncrypted)
        }
    }

    private suspend fun handleGroupMessage(
        contact: Contact,
        groupId: String,
        keyId: String,
        base64Encrypted: String
    ) {
        requireNotNull(groupDao)
        requireNotNull(groupKeyManager)

        try {
            // Verify we're a member of this group
            val group = groupDao.getGroupById(groupId)
            if (group == null) {
                // We might not know about this group yet - could be a race condition
                // where message arrives before key distribution
                return
            }

            // Decode and decrypt the group message
            val encrypted = android.util.Base64.decode(base64Encrypted, android.util.Base64.NO_WRAP)
            val decrypted = groupKeyManager.decryptGroupMessage(groupId, keyId, encrypted)
            val envelopeJson = String(decrypted, Charsets.UTF_8)

            // Parse the group message envelope
            val envelope = json.decodeFromString<GroupMessageEnvelope>(envelopeJson)

            // Handle based on message type
            when (envelope.type) {
                GroupMessageType.TEXT -> handleGroupTextMessage(contact, group, envelope)
                GroupMessageType.FILE -> handleGroupFileMessage(contact, group, envelope)
                GroupMessageType.MEMBER_ADDED -> handleMemberAdded(group, envelope)
                GroupMessageType.MEMBER_REMOVED -> handleMemberRemoved(group, envelope)
                GroupMessageType.KEY_ROTATION -> { /* Already handled via GROUP_KEY: prefix */ }
                GroupMessageType.GROUP_INFO_UPDATE -> handleGroupInfoUpdate(group, envelope)
                GroupMessageType.ADMIN_CHANGE -> handleAdminChange(group, envelope)
                GroupMessageType.DELIVERY_RECEIPT -> handleGroupDeliveryReceipt(envelope)
                GroupMessageType.READ_RECEIPT -> handleGroupReadReceipt(envelope)
            }

            // Update group's last message time for content messages
            if (envelope.type in listOf(GroupMessageType.TEXT, GroupMessageType.FILE)) {
                groupDao.updateLastMessageAt(groupId, envelope.timestamp)
            }

        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private suspend fun handleGroupTextMessage(
        contact: Contact,
        group: Group,
        envelope: GroupMessageEnvelope
    ) {
        val message = Message(
            id = envelope.messageId,
            contactId = "", // Empty for group messages
            groupId = group.id,
            senderContactId = contact.id,
            content = envelope.content ?: "",
            isOutgoing = false,
            timestamp = envelope.timestamp,
            status = MessageStatus.DELIVERED
        )
        messageDao.insert(message)
    }

    private suspend fun handleGroupFileMessage(
        contact: Contact,
        group: Group,
        envelope: GroupMessageEnvelope
    ) {
        val message = Message(
            id = envelope.messageId,
            contactId = "",
            groupId = group.id,
            senderContactId = contact.id,
            content = "[File]",
            fileId = envelope.fileId,
            isOutgoing = false,
            timestamp = envelope.timestamp,
            status = MessageStatus.DELIVERED
        )
        messageDao.insert(message)
    }

    private suspend fun handleMemberAdded(group: Group, envelope: GroupMessageEnvelope) {
        val memberId = envelope.metadata?.get("memberId") ?: return

        // Check if member already exists
        if (groupDao!!.isMember(group.id, memberId)) return

        // Get contact info if available
        val contact = contactDao.getById(memberId)
        val displayName = contact?.displayName ?: "Unknown"

        val member = GroupMember(
            groupId = group.id,
            contactId = memberId,
            displayName = displayName,
            role = MemberRole.MEMBER,
            joinedAt = envelope.timestamp,
            addedBy = envelope.senderId
        )

        groupDao.insertMember(member)

        // Insert system message
        val systemMessage = Message(
            id = UUID.randomUUID().toString(),
            contactId = "",
            groupId = group.id,
            content = "$displayName joined the group",
            isOutgoing = false,
            timestamp = envelope.timestamp,
            status = MessageStatus.DELIVERED
        )
        messageDao.insert(systemMessage)
    }

    private suspend fun handleMemberRemoved(group: Group, envelope: GroupMessageEnvelope) {
        val memberId = envelope.metadata?.get("memberId") ?: return

        // Get display name before removing
        val member = groupDao!!.getMember(group.id, memberId)
        val displayName = member?.displayName ?: "Someone"

        groupDao.removeMember(group.id, memberId)

        // Check if self was removed
        val content = if (memberId.isEmpty()) {
            "You were removed from the group"
        } else {
            "$displayName left the group"
        }

        // Insert system message
        val systemMessage = Message(
            id = UUID.randomUUID().toString(),
            contactId = "",
            groupId = group.id,
            content = content,
            isOutgoing = false,
            timestamp = envelope.timestamp,
            status = MessageStatus.DELIVERED
        )
        messageDao.insert(systemMessage)
    }

    private suspend fun handleGroupInfoUpdate(group: Group, envelope: GroupMessageEnvelope) {
        val newName = envelope.metadata?.get("name")
        val newAvatar = envelope.metadata?.get("avatarPath")

        newName?.let { groupDao!!.updateGroupName(group.id, it) }
        newAvatar?.let { groupDao!!.updateGroupAvatar(group.id, it) }

        // Insert system message
        val changes = mutableListOf<String>()
        newName?.let { changes.add("name to \"$it\"") }
        newAvatar?.let { changes.add("avatar") }

        if (changes.isNotEmpty()) {
            val systemMessage = Message(
                id = UUID.randomUUID().toString(),
                contactId = "",
                groupId = group.id,
                content = "Group ${changes.joinToString(" and ")} changed",
                isOutgoing = false,
                timestamp = envelope.timestamp,
                status = MessageStatus.DELIVERED
            )
            messageDao.insert(systemMessage)
        }
    }

    private suspend fun handleAdminChange(group: Group, envelope: GroupMessageEnvelope) {
        val memberId = envelope.metadata?.get("memberId") ?: return
        val newRole = envelope.metadata["role"]?.let {
            MemberRole.valueOf(it.uppercase())
        } ?: return

        groupDao!!.updateMemberRole(group.id, memberId, newRole)

        val member = groupDao.getMember(group.id, memberId)
        val displayName = member?.displayName ?: "Someone"
        val roleText = if (newRole == MemberRole.ADMIN) "an admin" else "a member"

        val systemMessage = Message(
            id = UUID.randomUUID().toString(),
            contactId = "",
            groupId = group.id,
            content = "$displayName is now $roleText",
            isOutgoing = false,
            timestamp = envelope.timestamp,
            status = MessageStatus.DELIVERED
        )
        messageDao.insert(systemMessage)
    }

    private suspend fun handleGroupDeliveryReceipt(envelope: GroupMessageEnvelope) {
        envelope.replyToId?.let { originalMessageId ->
            messageDao.updateStatus(originalMessageId, MessageStatus.DELIVERED)
        }
    }

    private suspend fun handleGroupReadReceipt(envelope: GroupMessageEnvelope) {
        envelope.replyToId?.let { originalMessageId ->
            messageDao.updateStatus(originalMessageId, MessageStatus.READ)
        }
    }

    private suspend fun handleGroupKeyDistribution(contact: Contact, keyDataJson: String) {
        requireNotNull(groupDao)
        requireNotNull(groupKeyManager)

        try {
            val keyData = json.decodeFromString<Map<String, String>>(keyDataJson)

            val groupId = keyData["groupId"] ?: return
            val groupName = keyData["groupName"] ?: return
            val keyId = keyData["keyId"] ?: return
            val rotationNumber = keyData["rotationNumber"]?.toIntOrNull() ?: 0
            val encryptedKeyBase64 = keyData["encryptedKey"] ?: return

            val encryptedKey = android.util.Base64.decode(encryptedKeyBase64, android.util.Base64.NO_WRAP)

            // Decrypt the group key using pairwise session
            val groupKey = groupKeyManager.decryptKeyFromMember(
                encryptedKey,
                contact.id,
                !contact.isInitiator // We're the receiver
            )

            // Check if group exists
            val existingGroup = groupDao.getGroupById(groupId)
            if (existingGroup == null) {
                // New group - create it
                val group = Group(
                    id = groupId,
                    name = groupName,
                    createdAt = System.currentTimeMillis(),
                    createdBy = contact.id,
                    currentKeyId = keyId,
                    keyRotationCount = rotationNumber
                )

                val selfMember = GroupMember(
                    groupId = groupId,
                    contactId = "",
                    displayName = "You",
                    role = MemberRole.MEMBER,
                    joinedAt = System.currentTimeMillis(),
                    addedBy = contact.id
                )

                val creatorMember = GroupMember(
                    groupId = groupId,
                    contactId = contact.id,
                    displayName = contact.displayName,
                    role = MemberRole.ADMIN,
                    joinedAt = System.currentTimeMillis(),
                    addedBy = contact.id
                )

                // Store key
                groupKeyManager.storeReceivedKey(groupId, keyId, groupKey, rotationNumber)

                // Create group with initial members
                val dummyKey = GroupKey(keyId, groupId, ByteArray(0), System.currentTimeMillis(), rotationNumber)
                groupDao.insertGroup(group)
                groupDao.insertMembers(listOf(selfMember, creatorMember))

            } else {
                // Key rotation - update key
                groupKeyManager.storeReceivedKey(groupId, keyId, groupKey, rotationNumber)
                groupDao.updateCurrentKey(groupId, keyId)
            }

        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
