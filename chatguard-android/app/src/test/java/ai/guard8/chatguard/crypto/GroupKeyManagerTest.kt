package ai.guard8.chatguard.crypto

import ai.guard8.chatguard.model.Group
import ai.guard8.chatguard.model.GroupKey
import ai.guard8.chatguard.model.GroupMember
import ai.guard8.chatguard.model.MemberRole
import ai.guard8.chatguard.storage.GroupDao
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for GroupKeyManager.
 * Tests key generation, rotation, encryption, and distribution.
 */
class GroupKeyManagerTest {

    private lateinit var keyManager: KeyManager
    private lateinit var shieldCrypto: ShieldCrypto
    private lateinit var groupDao: GroupDao
    private lateinit var groupKeyManager: GroupKeyManager

    @Before
    fun setup() {
        keyManager = mockk()
        shieldCrypto = mockk()
        groupDao = mockk()

        // Mock master key retrieval
        every { keyManager.retrieveKey("group_master_key") } returns ByteArray(32) { 0x42 }

        groupKeyManager = GroupKeyManager(keyManager, shieldCrypto, groupDao)
    }

    // ==================== Key Generation Tests ====================

    @Test
    fun `generateGroupKey creates 32-byte key`() {
        val key = groupKeyManager.generateGroupKey()
        assertEquals(32, key.size)
    }

    @Test
    fun `generateGroupKey creates random keys`() {
        val key1 = groupKeyManager.generateGroupKey()
        val key2 = groupKeyManager.generateGroupKey()

        // Keys should be different (cryptographically random)
        assertFalse("Keys should be random", key1.contentEquals(key2))
    }

    @Test
    fun `generateKeyId creates unique UUIDs`() {
        val id1 = groupKeyManager.generateKeyId()
        val id2 = groupKeyManager.generateKeyId()

        assertNotEquals("Key IDs should be unique", id1, id2)
        // UUID format check
        assertTrue("Should be UUID format", id1.matches(Regex("[a-f0-9-]{36}")))
    }

    // ==================== Key Creation Tests ====================

    @Test
    fun `createGroupKey creates key with rotation number 0`() = runBlocking {
        val groupId = "test-group-1"

        val groupKey = groupKeyManager.createGroupKey(groupId)

        assertEquals(groupId, groupKey.groupId)
        assertEquals(0, groupKey.rotationNumber)
        assertNotNull(groupKey.id)
        assertTrue(groupKey.encryptedKey.isNotEmpty())
    }

    // ==================== Key Rotation Tests ====================

    @Test
    fun `rotateKey generates new key with incremented rotation number`() = runBlocking {
        val group = Group(
            id = "test-group-1",
            name = "Test Group",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "old-key-id",
            keyRotationCount = 2
        )

        coEvery { groupDao.deleteOldKeys(any(), any()) } just Runs

        val newKey = groupKeyManager.rotateKey(group)

        assertEquals(group.id, newKey.groupId)
        assertEquals(3, newKey.rotationNumber) // 2 + 1
        assertNotEquals("old-key-id", newKey.id)
    }

    @Test
    fun `rotateKey cleans up old keys after MAX_OLD_KEYS_TO_KEEP`() = runBlocking {
        val group = Group(
            id = "test-group-1",
            name = "Test",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "old-key",
            keyRotationCount = 15 // After rotation: 16, should delete keys < 7
        )

        coEvery { groupDao.deleteOldKeys(any(), any()) } just Runs

        groupKeyManager.rotateKey(group)

        coVerify { groupDao.deleteOldKeys("test-group-1", 7) }
    }

    @Test
    fun `rotateKey does not delete keys when under threshold`() = runBlocking {
        val group = Group(
            id = "test-group-1",
            name = "Test",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "old-key",
            keyRotationCount = 3 // After rotation: 4, threshold would be -5 (negative)
        )

        groupKeyManager.rotateKey(group)

        // Should not call deleteOldKeys when threshold is <= 0
        coVerify(exactly = 0) { groupDao.deleteOldKeys(any(), any()) }
    }

    // ==================== Encryption Tests ====================

    @Test
    fun `encryptKeyForMember uses ShieldCrypto`() {
        val groupKey = ByteArray(32) { it.toByte() }
        val contactId = "contact-1"
        val expectedCiphertext = ByteArray(50) { 0xEE.toByte() }

        every { shieldCrypto.encryptMessage(contactId, true, any()) } returns expectedCiphertext

        val encrypted = groupKeyManager.encryptKeyForMember(groupKey, contactId, true)

        verify { shieldCrypto.encryptMessage(contactId, true, any()) }
        assertEquals(expectedCiphertext, encrypted)
    }

    @Test
    fun `decryptKeyFromMember returns decrypted key`() {
        val encryptedKey = ByteArray(50) { 0xEE.toByte() }
        val contactId = "contact-1"
        val base64Key = "AQIDBAUG" // Some base64

        every { shieldCrypto.decryptMessage(contactId, false, encryptedKey) } returns base64Key

        val decrypted = groupKeyManager.decryptKeyFromMember(encryptedKey, contactId, false)

        verify { shieldCrypto.decryptMessage(contactId, false, encryptedKey) }
        assertNotNull(decrypted)
    }

    // ==================== Group Message Encryption Tests ====================

    @Test
    fun `encryptGroupMessage throws when no key exists`() = runBlocking {
        val groupId = "nonexistent-group"

        coEvery { groupDao.getCurrentKey(groupId) } returns null

        try {
            groupKeyManager.encryptGroupMessage(groupId, "test".toByteArray())
            fail("Should throw exception when no key exists")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("No group key found") == true)
        }
    }

    @Test
    fun `decryptGroupMessage throws for unknown key`() = runBlocking {
        val groupId = "test-group"
        val keyId = "unknown-key"

        coEvery { groupDao.getKeyById(keyId) } returns null

        try {
            groupKeyManager.decryptGroupMessage(groupId, keyId, ByteArray(32))
            fail("Should throw exception for unknown key")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("Group key not found") == true)
        }
    }

    // ==================== Key Storage Tests ====================

    @Test
    fun `storeReceivedKey stores key in DAO`() = runBlocking {
        val groupId = "test-group-1"
        val keyId = "received-key-id"
        val keyBytes = ByteArray(32) { 0x11 }
        val rotationNumber = 5

        coEvery { groupDao.insertKey(any()) } just Runs

        groupKeyManager.storeReceivedKey(groupId, keyId, keyBytes, rotationNumber)

        coVerify {
            groupDao.insertKey(match {
                it.id == keyId &&
                it.groupId == groupId &&
                it.rotationNumber == rotationNumber
            })
        }
    }

    // ==================== Has Key Tests ====================

    @Test
    fun `hasKeyForGroup returns false when no key exists`() = runBlocking {
        val groupId = "unknown-group"

        coEvery { groupDao.getCurrentKey(groupId) } returns null

        assertFalse(groupKeyManager.hasKeyForGroup(groupId))
    }

    @Test
    fun `hasKeyForGroup returns true when key exists`() = runBlocking {
        val groupId = "test-group"
        val groupKey = GroupKey(
            id = "k1",
            groupId = groupId,
            encryptedKey = ByteArray(32),
            createdAt = System.currentTimeMillis(),
            rotationNumber = 0
        )

        coEvery { groupDao.getCurrentKey(groupId) } returns groupKey

        assertTrue(groupKeyManager.hasKeyForGroup(groupId))
    }

    // ==================== Key Distribution Tests ====================

    @Test
    fun `prepareKeyDistribution encrypts for all non-self members`() = runBlocking {
        val groupId = "test-group-1"
        val groupKey = ByteArray(32) { it.toByte() }
        val members = listOf(
            GroupMember(groupId, "", "Me", MemberRole.ADMIN, System.currentTimeMillis(), ""),
            GroupMember(groupId, "c1", "Alice", MemberRole.MEMBER, System.currentTimeMillis(), ""),
            GroupMember(groupId, "c2", "Bob", MemberRole.MEMBER, System.currentTimeMillis(), "")
        )

        val encryptedForAlice = ByteArray(50) { 0xAA.toByte() }
        val encryptedForBob = ByteArray(50) { 0xBB.toByte() }

        every { shieldCrypto.encryptMessage("c1", true, any()) } returns encryptedForAlice
        every { shieldCrypto.encryptMessage("c2", true, any()) } returns encryptedForBob

        val distribution = groupKeyManager.prepareKeyDistribution(groupId, members, groupKey)

        assertEquals(2, distribution.size) // Only Alice and Bob, not self
        assertEquals(encryptedForAlice, distribution["c1"])
        assertEquals(encryptedForBob, distribution["c2"])
    }

    @Test
    fun `prepareKeyDistribution skips self member`() = runBlocking {
        val groupId = "test-group-1"
        val groupKey = ByteArray(32)
        val members = listOf(
            GroupMember(groupId, "", "Me", MemberRole.ADMIN, System.currentTimeMillis(), "")
        )

        val distribution = groupKeyManager.prepareKeyDistribution(groupId, members, groupKey)

        assertTrue("Should not include self", distribution.isEmpty())
    }
}
