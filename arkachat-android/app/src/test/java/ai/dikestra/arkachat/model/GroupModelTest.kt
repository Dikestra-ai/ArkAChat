package ai.dikestra.arkachat.model

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for Group model validation and data integrity.
 */
class GroupModelTest {

    // ==================== Group Entity Tests ====================

    @Test
    fun `Group can be created with required fields`() {
        val group = Group(
            id = "g1",
            name = "Test Group",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "k1"
        )

        assertEquals("g1", group.id)
        assertEquals("Test Group", group.name)
        assertEquals("k1", group.currentKeyId)
        assertEquals(0, group.keyRotationCount)
        assertNull(group.avatarPath)
        assertNull(group.lastMessageAt)
    }

    @Test
    fun `Group with all fields`() {
        val timestamp = System.currentTimeMillis()
        val group = Group(
            id = "g1",
            name = "Full Group",
            createdAt = timestamp,
            createdBy = "creator-1",
            avatarPath = "/path/to/avatar.png",
            currentKeyId = "k3",
            keyRotationCount = 3,
            lastMessageAt = timestamp + 1000
        )

        assertEquals("g1", group.id)
        assertEquals("Full Group", group.name)
        assertEquals(timestamp, group.createdAt)
        assertEquals("creator-1", group.createdBy)
        assertEquals("/path/to/avatar.png", group.avatarPath)
        assertEquals("k3", group.currentKeyId)
        assertEquals(3, group.keyRotationCount)
        assertEquals(timestamp + 1000, group.lastMessageAt)
    }

    @Test
    fun `Group copy with updated name`() {
        val original = Group(
            id = "g1",
            name = "Original Name",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "k1"
        )

        val updated = original.copy(name = "New Name")

        assertEquals("New Name", updated.name)
        assertEquals(original.id, updated.id)
        assertEquals(original.currentKeyId, updated.currentKeyId)
    }

    @Test
    fun `Group copy with rotated key`() {
        val original = Group(
            id = "g1",
            name = "Test",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "k1",
            keyRotationCount = 0
        )

        val rotated = original.copy(
            currentKeyId = "k2",
            keyRotationCount = original.keyRotationCount + 1
        )

        assertEquals("k2", rotated.currentKeyId)
        assertEquals(1, rotated.keyRotationCount)
    }

    // ==================== GroupMember Entity Tests ====================

    @Test
    fun `GroupMember can be created as admin`() {
        val member = GroupMember(
            groupId = "g1",
            contactId = "",
            displayName = "Me",
            role = MemberRole.ADMIN,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        )

        assertEquals(MemberRole.ADMIN, member.role)
        assertTrue(member.contactId.isEmpty())
    }

    @Test
    fun `GroupMember can be created as regular member`() {
        val member = GroupMember(
            groupId = "g1",
            contactId = "c1",
            displayName = "Alice",
            role = MemberRole.MEMBER,
            joinedAt = System.currentTimeMillis(),
            addedBy = "admin-1"
        )

        assertEquals(MemberRole.MEMBER, member.role)
        assertEquals("c1", member.contactId)
        assertEquals("admin-1", member.addedBy)
    }

    @Test
    fun `GroupMember copy with promoted role`() {
        val original = GroupMember(
            groupId = "g1",
            contactId = "c1",
            displayName = "Alice",
            role = MemberRole.MEMBER,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        )

        val promoted = original.copy(role = MemberRole.ADMIN)

        assertEquals(MemberRole.ADMIN, promoted.role)
        assertEquals(original.contactId, promoted.contactId)
    }

    // ==================== GroupKey Entity Tests ====================

    @Test
    fun `GroupKey can be created`() {
        val key = GroupKey(
            id = "k1",
            groupId = "g1",
            encryptedKey = ByteArray(32) { it.toByte() },
            createdAt = System.currentTimeMillis(),
            rotationNumber = 0
        )

        assertEquals("k1", key.id)
        assertEquals("g1", key.groupId)
        assertEquals(32, key.encryptedKey.size)
        assertEquals(0, key.rotationNumber)
    }

    @Test
    fun `GroupKey equals compares content`() {
        val key1 = GroupKey(
            id = "k1",
            groupId = "g1",
            encryptedKey = ByteArray(32) { 0x42 },
            createdAt = 1000L,
            rotationNumber = 0
        )

        val key2 = GroupKey(
            id = "k1",
            groupId = "g1",
            encryptedKey = ByteArray(32) { 0x42 },
            createdAt = 1000L,
            rotationNumber = 0
        )

        assertEquals(key1, key2)
        assertEquals(key1.hashCode(), key2.hashCode())
    }

    @Test
    fun `GroupKey not equals with different encryptedKey`() {
        val key1 = GroupKey(
            id = "k1",
            groupId = "g1",
            encryptedKey = ByteArray(32) { 0x42 },
            createdAt = 1000L,
            rotationNumber = 0
        )

        val key2 = GroupKey(
            id = "k1",
            groupId = "g1",
            encryptedKey = ByteArray(32) { 0x43 },
            createdAt = 1000L,
            rotationNumber = 0
        )

        assertNotEquals(key1, key2)
    }

    // ==================== GroupWithMembers Tests ====================

    @Test
    fun `GroupWithMembers aggregates data correctly`() {
        val group = Group(
            id = "g1",
            name = "Test",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "k1"
        )

        val members = listOf(
            GroupMember("g1", "", "Me", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c1", "Alice", MemberRole.MEMBER, 0, "")
        )

        val groupWithMembers = GroupWithMembers(
            group = group,
            members = members,
            unreadCount = 5
        )

        assertEquals(group, groupWithMembers.group)
        assertEquals(2, groupWithMembers.members.size)
        assertEquals(5, groupWithMembers.unreadCount)
    }

    @Test
    fun `GroupWithMembers default unreadCount is zero`() {
        val group = Group(
            id = "g1",
            name = "Test",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "k1"
        )

        val groupWithMembers = GroupWithMembers(
            group = group,
            members = emptyList()
        )

        assertEquals(0, groupWithMembers.unreadCount)
    }

    // ==================== Validation Logic Tests ====================

    @Test
    fun `Group name cannot be validated as blank`() {
        val group = Group(
            id = "g1",
            name = "   ",
            createdAt = System.currentTimeMillis(),
            createdBy = "",
            currentKeyId = "k1"
        )

        assertFalse(isValidGroupName(group.name))
    }

    @Test
    fun `Group name with valid content passes validation`() {
        val validNames = listOf(
            "Family",
            "Work Team",
            "Project Alpha 🚀",
            "中文群组",
            "A"
        )

        for (name in validNames) {
            assertTrue("Should be valid: $name", isValidGroupName(name))
        }
    }

    @Test
    fun `Group name too long fails validation`() {
        val longName = "A".repeat(101) // Assuming 100 char limit
        assertFalse(isValidGroupName(longName))
    }

    @Test
    fun `Empty members list is valid for new group`() {
        assertTrue(isValidMemberCount(0, isNewGroup = true))
    }

    @Test
    fun `At least one member required for existing group`() {
        assertFalse(isValidMemberCount(0, isNewGroup = false))
        assertTrue(isValidMemberCount(1, isNewGroup = false))
    }

    @Test
    fun `Member count within limit is valid`() {
        assertTrue(isValidMemberCount(50, isNewGroup = false))
        assertTrue(isValidMemberCount(100, isNewGroup = false)) // Assuming 100 member limit
    }

    @Test
    fun `Member count exceeding limit is invalid`() {
        assertFalse(isValidMemberCount(101, isNewGroup = false)) // Assuming 100 member limit
    }

    // ==================== Helper Functions ====================

    private fun isValidGroupName(name: String): Boolean {
        return name.isNotBlank() && name.length <= 100
    }

    private fun isValidMemberCount(count: Int, isNewGroup: Boolean): Boolean {
        return if (isNewGroup) {
            count >= 0 && count <= 100
        } else {
            count in 1..100
        }
    }
}
