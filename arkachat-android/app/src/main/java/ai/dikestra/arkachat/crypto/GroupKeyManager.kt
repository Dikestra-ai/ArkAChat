package ai.dikestra.arkachat.crypto

import ai.dikestra.arkachat.model.Group
import ai.dikestra.arkachat.model.GroupKey
import ai.dikestra.arkachat.model.GroupMember
import ai.dikestra.arkachat.model.GroupMessageEnvelope
import ai.dikestra.arkachat.model.GroupMessageType
import ai.dikestra.arkachat.storage.ContactDao
import ai.dikestra.arkachat.storage.GroupDao
import ai.dikestra.shield.Shield
import ai.dikestra.shield.ShieldUtils
import java.util.Base64
import java.util.UUID

/**
 * Manages group encryption keys for secure group messaging.
 *
 * Group Key Protocol:
 * 1. Group creator generates a random 32-byte group key
 * 2. Group key is encrypted for each member using their pairwise Shield session
 * 3. Each member receives encrypted key via their pairwise SimpleX queue
 * 4. When a member is removed, a new group key is generated and distributed
 *    to remaining members (forward secrecy)
 * 5. Old keys are kept for decrypting historical messages
 */
class GroupKeyManager(
    private val keyManager: KeyManager,
    private val shieldCrypto: ShieldCrypto,
    private val groupDao: GroupDao,
    private val contactDao: ContactDao,
    private val adminKeyManager: GroupAdminKeyManager = GroupAdminKeyManager()
) {
    companion object {
        const val KEY_SIZE = 32 // 256-bit keys
        const val MAX_OLD_KEYS_TO_KEEP = 10 // Keep last N keys for decryption
    }

    /**
     * Generate a new random group key.
     */
    fun generateGroupKey(): ByteArray {
        return ShieldUtils.randomBytes(KEY_SIZE)
    }

    /**
     * Generate a unique key ID.
     */
    fun generateKeyId(): String {
        return UUID.randomUUID().toString()
    }

    /**
     * Create a new group with initial key.
     * Returns the group key ID and encrypted key for storage.
     */
    suspend fun createGroupKey(groupId: String): GroupKey {
        val key = generateGroupKey()
        val keyId = generateKeyId()

        // Encrypt the key with device master key for local storage
        val encryptedKey = encryptKeyForStorage(key)

        val groupKey = GroupKey(
            id = keyId,
            groupId = groupId,
            encryptedKey = encryptedKey,
            createdAt = System.currentTimeMillis(),
            rotationNumber = 0
        )

        return groupKey
    }

    /**
     * Rotate the group key (called when a member is removed).
     * Returns the new GroupKey to distribute to remaining members.
     */
    suspend fun rotateKey(group: Group): GroupKey {
        val newKey = generateGroupKey()
        val keyId = generateKeyId()
        val encryptedKey = encryptKeyForStorage(newKey)

        val groupKey = GroupKey(
            id = keyId,
            groupId = group.id,
            encryptedKey = encryptedKey,
            createdAt = System.currentTimeMillis(),
            rotationNumber = group.keyRotationCount + 1
        )

        // Delete keys older than the last MAX_OLD_KEYS_TO_KEEP rotations
        val keepAfter = group.keyRotationCount + 2 - MAX_OLD_KEYS_TO_KEEP
        if (keepAfter > 0) {
            groupDao.deleteOldKeys(group.id, keepAfter)
        }

        return groupKey
    }

    /**
     * Encrypt the group key for a specific member using their pairwise session.
     * The member will receive this via their individual SimpleX queue.
     */
    fun encryptKeyForMember(groupKey: ByteArray, contactId: String, isInitiator: Boolean): ByteArray {
        val base64Key = java.util.Base64.getEncoder().encodeToString(groupKey)
        return shieldCrypto.encryptMessage(contactId, isInitiator, base64Key)
    }

    /**
     * Decrypt a group key received from another member.
     */
    fun decryptKeyFromMember(encryptedKey: ByteArray, contactId: String, isInitiator: Boolean): ByteArray {
        val base64Key = shieldCrypto.decryptMessage(contactId, isInitiator, encryptedKey)
        return java.util.Base64.getDecoder().decode(base64Key)
    }

    /**
     * Encrypt a message using the group's current key.
     */
    suspend fun encryptGroupMessage(groupId: String, plaintext: ByteArray): ByteArray {
        val key = getDecryptedCurrentKey(groupId)
            ?: throw IllegalStateException("No group key found for group: $groupId")
        val padded = MessagePadding.pad(plaintext)
        return Shield.quickEncrypt(key, padded)
    }

    /**
     * Decrypt a message using the specified group key.
     */
    suspend fun decryptGroupMessage(groupId: String, keyId: String, ciphertext: ByteArray): ByteArray {
        val groupKey = groupDao.getKeyById(keyId)
            ?: throw IllegalStateException("Group key not found: $keyId")

        val key = decryptKeyFromStorage(groupKey.encryptedKey)
        val padded = Shield.quickDecrypt(key, ciphertext)
        return MessagePadding.unpad(padded)
    }

    /**
     * Get the current decrypted group key for a group.
     */
    suspend fun getDecryptedCurrentKey(groupId: String): ByteArray? {
        val groupKey = groupDao.getCurrentKey(groupId) ?: return null
        return decryptKeyFromStorage(groupKey.encryptedKey)
    }

    /**
     * Store a received group key (from group creator or during key rotation).
     */
    suspend fun storeReceivedKey(groupId: String, keyId: String, keyBytes: ByteArray, rotationNumber: Int) {
        val encryptedKey = encryptKeyForStorage(keyBytes)

        val groupKey = GroupKey(
            id = keyId,
            groupId = groupId,
            encryptedKey = encryptedKey,
            createdAt = System.currentTimeMillis(),
            rotationNumber = rotationNumber
        )

        groupDao.insertKey(groupKey)
    }

    /**
     * Check if we have a key for a group.
     */
    suspend fun hasKeyForGroup(groupId: String): Boolean {
        return groupDao.getCurrentKey(groupId) != null
    }

    /**
     * Encrypt key for local storage using device master key.
     */
    private fun encryptKeyForStorage(key: ByteArray): ByteArray {
        // Use KeyManager's master key for storage encryption
        val masterKeyBytes = getMasterKeyBytes()
        return Shield.quickEncrypt(masterKeyBytes, key)
    }

    /**
     * Decrypt key from local storage using device master key.
     */
    private fun decryptKeyFromStorage(encryptedKey: ByteArray): ByteArray {
        val masterKeyBytes = getMasterKeyBytes()
        return Shield.quickDecrypt(masterKeyBytes, encryptedKey)
    }

    /**
     * Get master key bytes for key encryption.
     * In production, this would come from secure hardware (TEE/SE).
     */
    private fun getMasterKeyBytes(): ByteArray {
        // Derive a stable key for group key encryption
        val stored = keyManager.retrieveKey("group_master_key")
        if (stored != null) return stored

        val newKey = ShieldUtils.randomBytes(KEY_SIZE)
        keyManager.storeKey("group_master_key", newKey)
        return newKey
    }

    /**
     * Sign a control-type [envelope] as admin and return a new copy with
     * [adminSignature] (and optionally [adminPublicKey]) populated.
     *
     * Call this on the sending side before serialising the envelope.
     */
    fun signEnvelope(envelope: GroupMessageEnvelope): GroupMessageEnvelope {
        val typeName = envelope.type.name
        require(typeName in GroupAdminKeyManager.ADMIN_CONTROLLED_TYPES) {
            "signEnvelope called on non-admin type $typeName"
        }
        val payloadJson = envelope.content ?: ""
        val rawSig = adminKeyManager.signControlMessage(
            groupId = envelope.groupId,
            type = typeName,
            senderId = envelope.senderId,
            timestamp = envelope.timestamp,
            payloadJson = payloadJson
        )
        val adminPubKey = when (envelope.type) {
            GroupMessageType.KEY_ROTATION, GroupMessageType.ADMIN_CHANGE ->
                adminKeyManager.getPublicKey(envelope.groupId)?.let {
                    Base64.getEncoder().encodeToString(it)
                }
            else -> null
        }
        return envelope.copy(
            adminSignature = Base64.getEncoder().encodeToString(rawSig),
            adminPublicKey = adminPubKey
        )
    }

    /**
     * Verify the [adminSignature] on a received control envelope.
     *
     * [storedAdminPublicKey] is the base64 SPKI stored on the [Group] record.
     * If null (first message from a new group), [envelope.adminPublicKey] is used
     * and must be stored by the caller before trusting any further messages.
     *
     * @return true if the signature is valid
     */
    fun verifyEnvelope(
        envelope: GroupMessageEnvelope,
        storedAdminPublicKey: String?
    ): Boolean {
        val sigBase64 = envelope.adminSignature ?: return false
        val rawSig = try {
            Base64.getDecoder().decode(sigBase64)
        } catch (_: Exception) { return false }

        // Prefer stored key; fall back to key carried in the message (invite/rotation)
        val pubKeyBase64 = storedAdminPublicKey ?: envelope.adminPublicKey ?: return false
        val pubKeyBytes = try {
            Base64.getDecoder().decode(pubKeyBase64)
        } catch (_: Exception) { return false }

        return adminKeyManager.verifyControlMessage(
            adminPublicKeyBytes = pubKeyBytes,
            type = envelope.type.name,
            groupId = envelope.groupId,
            senderId = envelope.senderId,
            timestamp = envelope.timestamp,
            payloadJson = envelope.content ?: "",
            rawSignature = rawSig
        )
    }

    /**
     * Prepare key distribution data for all members of a group.
     * Returns map of contactId -> encrypted key bytes.
     */
    suspend fun prepareKeyDistribution(
        groupId: String,
        members: List<GroupMember>,
        groupKey: ByteArray
    ): Map<String, ByteArray> {
        val distribution = mutableMapOf<String, ByteArray>()

        for (member in members) {
            // Skip self (contactId is empty for self)
            if (member.contactId.isEmpty()) continue

            // Get isInitiator from contact record in database
            val contact = contactDao.getById(member.contactId)
            val isInitiator = contact?.isInitiator ?: true

            val encryptedKey = encryptKeyForMember(groupKey, member.contactId, isInitiator)
            distribution[member.contactId] = encryptedKey
        }

        return distribution
    }
}
