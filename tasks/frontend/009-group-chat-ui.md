---
id: frontend-009
title: "Group Chat UI"
status: done
priority: high
tags: [frontend, groups, ui, android, web, compose, react]
dependencies: [backend-009]
assignee: developer
created: 2026-01-20T18:01:02Z
estimate: 6h
complexity: 4
area: frontend
---

# Group Chat UI

## Context
Build the user interface for group chat functionality on both Android (Jetpack Compose)
and Web (React/Next.js). This includes group creation, member management, and group
messaging screens.

## Objectives
- Create group chat screen with member avatars
- Build group creation flow
- Implement member management UI
- Show group info and settings
- Support group-specific message display

## Tasks

### Android (Jetpack Compose)
- [x] Create GroupListScreen showing all groups
- [x] Create GroupChatScreen with group header
- [x] Build CreateGroupDialog with contact selection
- [x] Create GroupInfoScreen with member list
- [x] Implement AddMemberDialog
- [x] Create GroupSettingsScreen
- [x] Add group message bubbles with sender name
- [x] Show member avatars in group chat
- [x] Implement leave group confirmation dialog
- [ ] Add group notifications settings

### Web (React/Next.js)
- [x] Create GroupList component
- [x] Create GroupChatWindow component
- [x] Build CreateGroupModal with multi-select
- [x] Create GroupInfoPanel (sidebar)
- [x] Implement AddMemberModal
- [x] Create GroupSettingsModal
- [x] Style group message bubbles with sender
- [ ] Show member presence indicators
- [x] Implement leave group flow
- [x] Add group to Zustand store

## Technical Details

### Android Components

```kotlin
// GroupListScreen.kt
@Composable
fun GroupListScreen(
    groups: List<Group>,
    onGroupClick: (String) -> Unit,
    onCreateGroup: () -> Unit
) {
    LazyColumn {
        items(groups) { group ->
            GroupListItem(
                group = group,
                onClick = { onGroupClick(group.id) }
            )
        }
    }
    FloatingActionButton(onClick = onCreateGroup) {
        Icon(Icons.Default.GroupAdd, "Create Group")
    }
}

// GroupChatScreen.kt
@Composable
fun GroupChatScreen(
    groupId: String,
    viewModel: GroupViewModel = viewModel()
) {
    val group by viewModel.group.collectAsState()
    val messages by viewModel.messages.collectAsState()
    val members by viewModel.members.collectAsState()

    Column {
        GroupChatHeader(
            group = group,
            memberCount = members.size,
            onInfoClick = { /* navigate to info */ }
        )
        GroupMessageList(
            messages = messages,
            members = members,
            modifier = Modifier.weight(1f)
        )
        MessageInput(onSend = viewModel::sendMessage)
    }
}

// GroupMessageBubble.kt
@Composable
fun GroupMessageBubble(
    message: Message,
    senderName: String,
    isFromMe: Boolean
) {
    Column(
        horizontalAlignment = if (isFromMe) Alignment.End else Alignment.Start
    ) {
        if (!isFromMe) {
            Text(
                text = senderName,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary
            )
        }
        MessageBubble(message = message, isOutgoing = isFromMe)
    }
}
```

### Web Components

```typescript
// GroupChatWindow.tsx
export function GroupChatWindow({ groupId }: { groupId: string }) {
    const { group, messages, members, sendMessage } = useGroupChat(groupId);

    return (
        <div className="flex flex-col h-full">
            <GroupChatHeader
                group={group}
                memberCount={members.length}
                onInfoClick={() => setShowInfo(true)}
            />
            <GroupMessageList
                messages={messages}
                members={members}
                className="flex-1 overflow-y-auto"
            />
            <MessageInput onSend={sendMessage} />
            {showInfo && (
                <GroupInfoPanel
                    group={group}
                    members={members}
                    onClose={() => setShowInfo(false)}
                />
            )}
        </div>
    );
}

// CreateGroupModal.tsx
export function CreateGroupModal({ isOpen, onClose }: Props) {
    const [name, setName] = useState('');
    const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
    const { contacts } = useChatBridge();
    const { createGroup } = useGroupBridge();

    const handleCreate = async () => {
        if (name && selectedContacts.length > 0) {
            await createGroup(name, selectedContacts);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <h2>Create Group</h2>
            <Input
                placeholder="Group name"
                value={name}
                onChange={e => setName(e.target.value)}
            />
            <ContactMultiSelect
                contacts={contacts}
                selected={selectedContacts}
                onChange={setSelectedContacts}
            />
            <Button onClick={handleCreate} disabled={!name || selectedContacts.length === 0}>
                Create Group
            </Button>
        </Modal>
    );
}
```

### Group Message Display
- Show sender name above message (except for own messages)
- Use consistent color per sender (hash contact ID to color)
- Show small avatar next to sender name
- Group consecutive messages from same sender
- Show "X is typing" for multiple typers

### Navigation Updates
- Add Groups tab/section to main navigation
- Group chat accessible from group list
- Deep link support: `/group/{groupId}`
- Back navigation returns to group list

## Files to Create

### Android
- `ui/groups/GroupListScreen.kt`
- `ui/groups/GroupChatScreen.kt`
- `ui/groups/GroupInfoScreen.kt`
- `ui/groups/GroupSettingsScreen.kt`
- `ui/groups/CreateGroupDialog.kt`
- `ui/groups/AddMemberDialog.kt`
- `ui/groups/GroupMessageBubble.kt`
- `ui/groups/GroupChatHeader.kt`
- `viewmodel/GroupListViewModel.kt`
- `viewmodel/GroupChatViewModel.kt`

### Web
- `components/groups/GroupList.tsx`
- `components/groups/GroupChatWindow.tsx`
- `components/groups/GroupInfoPanel.tsx`
- `components/groups/GroupSettingsModal.tsx`
- `components/groups/CreateGroupModal.tsx`
- `components/groups/AddMemberModal.tsx`
- `components/groups/GroupMessageBubble.tsx`
- `components/groups/GroupChatHeader.tsx`
- `hooks/useGroupChat.ts`
- `hooks/useGroupBridge.ts`
- `app/group/[groupId]/page.tsx`

## Acceptance Criteria
- [ ] Can view list of groups
- [ ] Can create new group with name and members
- [ ] Group chat shows sender names on messages
- [ ] Can view group info with member list
- [ ] Can add new members to group (admin only)
- [ ] Can remove members from group (admin only)
- [ ] Can leave group
- [ ] Can update group name/avatar (admin only)
- [ ] Navigation between group list and chat works
- [ ] UI matches existing chat design language
- [ ] Works on both Android and Web

## Design Notes
- Use existing color palette and typography
- Group avatar: show up to 4 member avatars in grid
- Member list shows role badges (Admin/Member)
- Empty state: "Create your first group"
- Loading states for all async operations
