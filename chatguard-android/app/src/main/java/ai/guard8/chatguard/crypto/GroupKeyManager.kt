package ai.guard8.chatguard.crypto

import ai.guard8.chatguard.model.Group
import ai.guard8.chatguard.model.GroupKey
import ai.guard8.chatguard.model.GroupMember
import ai.guard8.chatguard.storage.GroupDao
import ai.guard8.shield.Shield
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
    private val groupDao: GroupDao
) {
    companion object {
        const val KEY_SIZE = 32 // 256-bit keys
        const val MAX_OLD_KEYS_TO_KEEP = 10 // Keep last N keys for decryption
    }

    /**
     * Generate a new random group key.
     */
    fun generateGroupKey(): ByteArray {
        return Shield.randomBytes(KEY_SIZE)
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

        // Clean up old keys (keep last N for decryption)
        val keepAfter = group.keyRotationCount + 1 - MAX_OLD_KEYS_TO_KEEP
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
        return shieldCrypto.encryptMessage(contactId, isInitiator,
            android.util.Base64.encodeToString(groupKey, android.util.Base64.NO_WRAP))
            .let { it } // Returns encrypted bytes
    }

    /**
     * Decrypt a group key received from another member.
     */
    fun decryptKeyFromMember(encryptedKey: ByteArray, contactId: String, isInitiator: Boolean): ByteArray {
        val base64Key = shieldCrypto.decryptMessage(contactId, isInitiator, encryptedKey)
        return android.util.Base64.decode(base64Key, android.util.Base64.NO_WRAP)
    }

    /**
     * Encrypt a message using the group's current key.
     */
    suspend fun encryptGroupMessage(groupId: String, plaintext: ByteArray): ByteArray {
        val key = getDecryptedCurrentKey(groupId)
            ?: throw IllegalStateException("No group key found for group: $groupId")
        return Shield.quickEncrypt(key, plaintext)
    }

    /**
     * Decrypt a message using the specified group key.
     */
    suspend fun decryptGroupMessage(groupId: String, keyId: String, ciphertext: ByteArray): ByteArray {
        val groupKey = groupDao.getKeyById(keyId)
            ?: throw IllegalStateException("Group key not found: $keyId")

        val key = decryptKeyFromStorage(groupKey.encryptedKey)
        return Shield.quickDecrypt(key, ciphertext)
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

        val newKey = Shield.randomBytes(KEY_SIZE)
        keyManager.storeKey("group_master_key", newKey)
        return newKey
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

            // Check if we are initiator for this contact
            // This would come from the contact's stored metadata
            val isInitiator = true // TODO: get from contact

            val encryptedKey = encryptKeyForMember(groupKey, member.contactId, isInitiator)
            distribution[member.contactId] = encryptedKey
        }

        return distribution
    }
}
