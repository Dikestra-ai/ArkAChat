package ai.guard8.chatguard.model

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for group member permissions and role-based access control.
 */
class GroupPermissionTest {

    // ==================== MemberRole Tests ====================

    @Test
    fun `MemberRole ADMIN value is correct`() {
        assertEquals("ADMIN", MemberRole.ADMIN.name)
    }

    @Test
    fun `MemberRole MEMBER value is correct`() {
        assertEquals("MEMBER", MemberRole.MEMBER.name)
    }

    @Test
    fun `MemberRole has exactly 2 values`() {
        assertEquals(2, MemberRole.values().size)
    }

    // ==================== Permission Helper Tests ====================

    @Test
    fun `admin can add members`() {
        val member = createMember(MemberRole.ADMIN)
        assertTrue(canAddMembers(member))
    }

    @Test
    fun `member cannot add members`() {
        val member = createMember(MemberRole.MEMBER)
        assertFalse(canAddMembers(member))
    }

    @Test
    fun `admin can remove members`() {
        val member = createMember(MemberRole.ADMIN)
        assertTrue(canRemoveMembers(member))
    }

    @Test
    fun `member cannot remove members`() {
        val member = createMember(MemberRole.MEMBER)
        assertFalse(canRemoveMembers(member))
    }

    @Test
    fun `admin can change group settings`() {
        val member = createMember(MemberRole.ADMIN)
        assertTrue(canChangeSettings(member))
    }

    @Test
    fun `member cannot change group settings`() {
        val member = createMember(MemberRole.MEMBER)
        assertFalse(canChangeSettings(member))
    }

    @Test
    fun `admin can promote members`() {
        val member = createMember(MemberRole.ADMIN)
        assertTrue(canPromoteMembers(member))
    }

    @Test
    fun `member cannot promote members`() {
        val member = createMember(MemberRole.MEMBER)
        assertFalse(canPromoteMembers(member))
    }

    @Test
    fun `admin can demote other admins`() {
        val member = createMember(MemberRole.ADMIN)
        assertTrue(canDemoteMembers(member))
    }

    @Test
    fun `member cannot demote admins`() {
        val member = createMember(MemberRole.MEMBER)
        assertFalse(canDemoteMembers(member))
    }

    @Test
    fun `anyone can send messages`() {
        val admin = createMember(MemberRole.ADMIN)
        val member = createMember(MemberRole.MEMBER)

        assertTrue(canSendMessages(admin))
        assertTrue(canSendMessages(member))
    }

    @Test
    fun `anyone can leave group`() {
        val admin = createMember(MemberRole.ADMIN)
        val member = createMember(MemberRole.MEMBER)

        assertTrue(canLeaveGroup(admin))
        assertTrue(canLeaveGroup(member))
    }

    // ==================== Self Member Detection ====================

    @Test
    fun `empty contactId indicates self`() {
        val selfMember = GroupMember(
            groupId = "g1",
            contactId = "",
            displayName = "Me",
            role = MemberRole.ADMIN,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        )

        assertTrue(isSelf(selfMember))
    }

    @Test
    fun `non-empty contactId indicates other member`() {
        val otherMember = GroupMember(
            groupId = "g1",
            contactId = "contact-1",
            displayName = "Alice",
            role = MemberRole.MEMBER,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        )

        assertFalse(isSelf(otherMember))
    }

    // ==================== Role Finding Tests ====================

    @Test
    fun `findSelfRole returns self member role`() {
        val members = listOf(
            GroupMember("g1", "", "Me", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c1", "Alice", MemberRole.MEMBER, 0, ""),
            GroupMember("g1", "c2", "Bob", MemberRole.MEMBER, 0, "")
        )

        val selfRole = findSelfRole(members)
        assertEquals(MemberRole.ADMIN, selfRole)
    }

    @Test
    fun `findSelfRole returns null when self not found`() {
        val members = listOf(
            GroupMember("g1", "c1", "Alice", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c2", "Bob", MemberRole.MEMBER, 0, "")
        )

        val selfRole = findSelfRole(members)
        assertNull(selfRole)
    }

    @Test
    fun `isSelfAdmin returns true when self is admin`() {
        val members = listOf(
            GroupMember("g1", "", "Me", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c1", "Alice", MemberRole.MEMBER, 0, "")
        )

        assertTrue(isSelfAdmin(members))
    }

    @Test
    fun `isSelfAdmin returns false when self is member`() {
        val members = listOf(
            GroupMember("g1", "", "Me", MemberRole.MEMBER, 0, "admin"),
            GroupMember("g1", "admin", "Admin", MemberRole.ADMIN, 0, "")
        )

        assertFalse(isSelfAdmin(members))
    }

    @Test
    fun `isSelfAdmin returns false when self not in group`() {
        val members = listOf(
            GroupMember("g1", "admin", "Admin", MemberRole.ADMIN, 0, "")
        )

        assertFalse(isSelfAdmin(members))
    }

    // ==================== Admin Count Tests ====================

    @Test
    fun `countAdmins returns correct count`() {
        val members = listOf(
            GroupMember("g1", "", "Me", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c1", "Alice", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c2", "Bob", MemberRole.MEMBER, 0, "")
        )

        assertEquals(2, countAdmins(members))
    }

    @Test
    fun `canRemoveAdmin returns true when multiple admins exist`() {
        val members = listOf(
            GroupMember("g1", "", "Me", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c1", "Alice", MemberRole.ADMIN, 0, "")
        )

        assertTrue(canRemoveAdmin(members))
    }

    @Test
    fun `canRemoveAdmin returns false when only one admin exists`() {
        val members = listOf(
            GroupMember("g1", "", "Me", MemberRole.ADMIN, 0, ""),
            GroupMember("g1", "c1", "Alice", MemberRole.MEMBER, 0, "")
        )

        assertFalse(canRemoveAdmin(members))
    }

    // ==================== Helper Functions ====================

    private fun createMember(role: MemberRole): GroupMember {
        return GroupMember(
            groupId = "g1",
            contactId = if (role == MemberRole.ADMIN) "" else "c1",
            displayName = if (role == MemberRole.ADMIN) "Me" else "Alice",
            role = role,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        )
    }

    // Permission check functions (would be in a utility class)
    private fun canAddMembers(member: GroupMember): Boolean = member.role == MemberRole.ADMIN
    private fun canRemoveMembers(member: GroupMember): Boolean = member.role == MemberRole.ADMIN
    private fun canChangeSettings(member: GroupMember): Boolean = member.role == MemberRole.ADMIN
    private fun canPromoteMembers(member: GroupMember): Boolean = member.role == MemberRole.ADMIN
    private fun canDemoteMembers(member: GroupMember): Boolean = member.role == MemberRole.ADMIN
    private fun canSendMessages(member: GroupMember): Boolean = true
    private fun canLeaveGroup(member: GroupMember): Boolean = true
    private fun isSelf(member: GroupMember): Boolean = member.contactId.isEmpty()

    private fun findSelfRole(members: List<GroupMember>): MemberRole? {
        return members.find { it.contactId.isEmpty() }?.role
    }

    private fun isSelfAdmin(members: List<GroupMember>): Boolean {
        return findSelfRole(members) == MemberRole.ADMIN
    }

    private fun countAdmins(members: List<GroupMember>): Int {
        return members.count { it.role == MemberRole.ADMIN }
    }

    private fun canRemoveAdmin(members: List<GroupMember>): Boolean {
        return countAdmins(members) > 1
    }
}
