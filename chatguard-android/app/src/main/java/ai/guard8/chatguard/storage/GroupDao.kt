package ai.guard8.chatguard.storage

import androidx.room.*
import ai.guard8.chatguard.model.Group
import ai.guard8.chatguard.model.GroupKey
import ai.guard8.chatguard.model.GroupMember
import ai.guard8.chatguard.model.MemberRole
import kotlinx.coroutines.flow.Flow

@Dao
interface GroupDao {

    // Group operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGroup(group: Group)

    @Update
    suspend fun updateGroup(group: Group)

    @Delete
    suspend fun deleteGroup(group: Group)

    @Query("SELECT * FROM groups WHERE id = :groupId")
    suspend fun getGroupById(groupId: String): Group?

    @Query("SELECT * FROM groups WHERE id = :groupId")
    fun getGroupByIdFlow(groupId: String): Flow<Group?>

    @Query("SELECT * FROM groups ORDER BY lastMessageAt DESC NULLS LAST")
    fun getAllGroups(): Flow<List<Group>>

    @Query("UPDATE groups SET lastMessageAt = :timestamp WHERE id = :groupId")
    suspend fun updateLastMessageAt(groupId: String, timestamp: Long)

    @Query("UPDATE groups SET currentKeyId = :keyId, keyRotationCount = keyRotationCount + 1 WHERE id = :groupId")
    suspend fun updateCurrentKey(groupId: String, keyId: String)

    @Query("UPDATE groups SET name = :name WHERE id = :groupId")
    suspend fun updateGroupName(groupId: String, name: String)

    @Query("UPDATE groups SET avatarPath = :avatarPath WHERE id = :groupId")
    suspend fun updateGroupAvatar(groupId: String, avatarPath: String?)

    // Member operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMember(member: GroupMember)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMembers(members: List<GroupMember>)

    @Delete
    suspend fun deleteMember(member: GroupMember)

    @Query("DELETE FROM group_members WHERE groupId = :groupId AND contactId = :contactId")
    suspend fun removeMember(groupId: String, contactId: String)

    @Query("SELECT * FROM group_members WHERE groupId = :groupId")
    suspend fun getMembers(groupId: String): List<GroupMember>

    @Query("SELECT * FROM group_members WHERE groupId = :groupId")
    fun getMembersFlow(groupId: String): Flow<List<GroupMember>>

    @Query("SELECT * FROM group_members WHERE groupId = :groupId AND contactId = :contactId")
    suspend fun getMember(groupId: String, contactId: String): GroupMember?

    @Query("SELECT * FROM group_members WHERE groupId = :groupId AND role = :role")
    suspend fun getMembersByRole(groupId: String, role: MemberRole): List<GroupMember>

    @Query("UPDATE group_members SET role = :role WHERE groupId = :groupId AND contactId = :contactId")
    suspend fun updateMemberRole(groupId: String, contactId: String, role: MemberRole)

    @Query("SELECT COUNT(*) FROM group_members WHERE groupId = :groupId")
    suspend fun getMemberCount(groupId: String): Int

    @Query("SELECT EXISTS(SELECT 1 FROM group_members WHERE groupId = :groupId AND contactId = :contactId)")
    suspend fun isMember(groupId: String, contactId: String): Boolean

    // Key operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertKey(key: GroupKey)

    @Query("SELECT * FROM group_keys WHERE id = :keyId")
    suspend fun getKeyById(keyId: String): GroupKey?

    @Query("SELECT * FROM group_keys WHERE groupId = :groupId ORDER BY rotationNumber DESC LIMIT 1")
    suspend fun getCurrentKey(groupId: String): GroupKey?

    @Query("SELECT * FROM group_keys WHERE groupId = :groupId ORDER BY rotationNumber DESC")
    suspend fun getAllKeys(groupId: String): List<GroupKey>

    @Query("DELETE FROM group_keys WHERE groupId = :groupId AND rotationNumber < :keepAfter")
    suspend fun deleteOldKeys(groupId: String, keepAfter: Int)

    // Group messages
    @Query("""
        SELECT * FROM messages
        WHERE groupId = :groupId
        ORDER BY timestamp ASC
    """)
    fun getGroupMessages(groupId: String): Flow<List<ai.guard8.chatguard.model.Message>>

    @Query("""
        SELECT COUNT(*) FROM messages
        WHERE groupId = :groupId
        AND isOutgoing = 0
        AND status != 'READ'
    """)
    fun getUnreadCount(groupId: String): Flow<Int>

    // Transaction for creating group with members
    @Transaction
    suspend fun createGroupWithMembers(group: Group, members: List<GroupMember>, key: GroupKey) {
        insertGroup(group)
        insertMembers(members)
        insertKey(key)
    }

    // Transaction for removing member with key rotation
    @Transaction
    suspend fun removeMemberAndRotateKey(groupId: String, contactId: String, newKey: GroupKey) {
        removeMember(groupId, contactId)
        insertKey(newKey)
        updateCurrentKey(groupId, newKey.id)
    }
}
