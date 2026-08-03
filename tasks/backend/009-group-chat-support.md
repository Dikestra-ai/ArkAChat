---
id: backend-009
title: "Group Chat Support"
status: done
priority: high
tags: [backend, groups, messaging, encryption, simplex]
dependencies: [backend-008]
assignee: developer
created: 2026-01-20T18:00:16Z
estimate: 8h
complexity: 5
area: backend
---

# Group Chat Support

## Context
Extend ArkAChat to support group conversations with end-to-end encryption.
Groups use a combination of Shield encryption and SimpleX messaging, with
a shared group key distributed to all members via pairwise channels.

## Objectives
- Create and manage encrypted group conversations
- Distribute group keys securely to members
- Support adding/removing group members
- Maintain forward secrecy for group messages
- Sync group state across all members

## Tasks
- [x] Design group key distribution protocol
- [x] Create Group data model (Android + Web)
- [x] Create GroupMember data model
- [x] Implement GroupKeyManager for key rotation
- [x] Create group creation flow
- [x] Implement member invitation via existing contact
- [x] Implement member removal with key rotation
- [x] Update ShieldSimplexBridge for group messages
- [x] Create GroupMessageEnvelope format
- [x] Implement group message fan-out (send to all members)
- [x] Implement group message aggregation (receive from any member)
- [x] Add group admin permissions
- [x] Create group settings (name, avatar, notifications)
- [x] Implement leave group functionality
- [x] Handle offline members and message sync

## Technical Details

### Group Data Model
```kotlin
// Android
data class Group(
    val id: String,
    val name: String,
    val createdAt: Long,
    val createdBy: String,        // Contact ID of creator
    val avatarPath: String?,
    val currentKeyId: String,     // Current group key identifier
    val keyRotationCount: Int
)

data class GroupMember(
    val groupId: String,
    val contactId: String,
    val role: MemberRole,         // ADMIN, MEMBER
    val joinedAt: Long,
    val addedBy: String
)

enum class MemberRole { ADMIN, MEMBER }
```

### Group Key Distribution Protocol
```
1. Creator generates group key (K_group)
2. For each member M:
   - Encrypt K_group with pairwise Shield session: E(K_group, session_M)
   - Send via existing SimpleX queue to M
3. Member receives and stores K_group
4. All group messages encrypted with K_group
5. On member removal:
   - Generate new K_group'
   - Distribute to remaining members
   - Old member cannot decrypt new messages
```

### Group Message Envelope
```kotlin
data class GroupMessageEnvelope(
    val type: GroupMessageType,
    val groupId: String,
    val senderId: String,         // Contact ID of sender
    val messageId: String,
    val timestamp: Long,
    val keyId: String,            // Which group key version
    val content: String?,
    val fileId: String?,
    val replyToId: String?
)

enum class GroupMessageType {
    TEXT,
    FILE,
    MEMBER_ADDED,
    MEMBER_REMOVED,
    KEY_ROTATION,
    GROUP_INFO_UPDATE,
    ADMIN_CHANGE
}
```

### Message Flow: Send Group Message
```
1. Sender encrypts content with current K_group
2. Create GroupMessageEnvelope
3. Encrypt envelope with K_group
4. For each member:
   - Send encrypted envelope via pairwise SimpleX queue
5. Update local database
```

### Message Flow: Receive Group Message
```
1. Receive encrypted bytes from SimpleX
2. Identify sender contact
3. Decrypt outer envelope with pairwise session
4. Parse GroupMessageEnvelope
5. Decrypt content with K_group (by keyId)
6. Store in database with groupId
7. Send delivery receipt to sender
```

### Key Rotation Triggers
- Member removed from group
- Admin initiates manual rotation
- Periodic rotation (configurable, e.g., every 100 messages)
- Suspected key compromise

### Database Schema Updates
```sql
-- Groups table
CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    avatar_path TEXT,
    current_key_id TEXT NOT NULL,
    key_rotation_count INTEGER DEFAULT 0
);

-- Group members table
CREATE TABLE group_members (
    group_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    role TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    added_by TEXT NOT NULL,
    PRIMARY KEY (group_id, contact_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

-- Group keys table (encrypted storage)
CREATE TABLE group_keys (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    encrypted_key BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    rotation_number INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id)
);

-- Update messages table
ALTER TABLE messages ADD COLUMN group_id TEXT;
ALTER TABLE messages ADD COLUMN sender_contact_id TEXT;
```

## Files to Create/Modify

### Android
- `model/Group.kt` - Group data class
- `model/GroupMember.kt` - GroupMember data class
- `model/GroupMessageEnvelope.kt` - Envelope format
- `storage/GroupDao.kt` - Group database operations
- `storage/GroupMemberDao.kt` - Member operations
- `storage/GroupKeyDao.kt` - Key storage
- `crypto/GroupKeyManager.kt` - Key generation/rotation
- `bridge/ShieldSimplexBridge.kt` - Add group support
- `viewmodel/GroupViewModel.kt` - Group UI state
- `ui/GroupChatScreen.kt` - Group chat UI
- `ui/GroupSettingsScreen.kt` - Group management

### Web
- `lib/model/group.ts` - Group types
- `lib/storage/groupStore.ts` - Zustand store for groups
- `lib/crypto/groupKeyManager.ts` - Key management
- `lib/bridge/shieldSimplexBridge.ts` - Add group support
- `components/GroupChat.tsx` - Group chat UI
- `components/GroupSettings.tsx` - Group management
- `components/CreateGroupModal.tsx` - Group creation

## Acceptance Criteria
- [ ] Can create a new group with a name
- [ ] Can add existing contacts to group
- [ ] Group messages encrypted with group key
- [ ] All members receive group messages
- [ ] Can remove members from group
- [ ] Key rotates when member removed
- [ ] Removed members cannot read new messages
- [ ] Group admin can change group settings
- [ ] Members can leave group voluntarily
- [ ] Group state syncs across Android and Web
- [ ] Offline members receive messages when back online

## Security Considerations
- Group keys never transmitted in plaintext
- Pairwise channels provide sender authentication
- Key rotation on member removal ensures forward secrecy
- Admin actions require cryptographic proof
- No single point of failure (no central server)

## Notes
- Start with small groups (max 50 members) for initial implementation
- Consider Sender Keys protocol for larger groups in future
- Group avatar stored encrypted like other files
- Group name changes broadcast as GROUP_INFO_UPDATE message
