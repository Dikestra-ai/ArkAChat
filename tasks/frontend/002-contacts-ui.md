---
id: frontend-002
title: "Contacts & Conversations List UI"
status: todo
priority: high
tags: [ui, compose, android, contacts]
dependencies: [backend-003]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 3h
complexity: 2
area: frontend
---

# Contacts & Conversations List UI

## Context
Implement the contacts/conversations list screen showing recent chats and allowing new contact addition via QR code.

## Objectives
- Create conversation list with last message preview
- Show unread message count badges
- Add floating action button for new contact
- Implement QR code scanner for contact pairing

## Tasks
- [ ] Create `ContactsScreen.kt` main composable
- [ ] Implement `ConversationItem.kt` list item
- [ ] Create `ContactsViewModel.kt` for state
- [ ] Add FAB for new contact action
- [ ] Create `QRScannerScreen.kt` for pairing
- [ ] Create `QRDisplayScreen.kt` to show own QR
- [ ] Implement search/filter functionality

## Technical Details

### ConversationItem
```kotlin
@Composable
fun ConversationItem(
    contact: Contact,
    lastMessage: String?,
    unreadCount: Int,
    timestamp: Long,
    onClick: () -> Unit
)
```

### QR Code Pairing Flow
1. User A: Shows QR with queue address + public key
2. User B: Scans QR, creates reciprocal queue
3. User B: Shows confirmation QR
4. User A: Scans confirmation, connection established
5. Both: Derive shared key from exchange

### ContactsViewModel
```kotlin
class ContactsViewModel(
    private val db: ChatDatabase,
    private val crypto: ShieldCrypto
) : ViewModel() {
    val conversations: StateFlow<List<ConversationWithContact>>

    fun createInvitation(): ConnectionInvitation
    fun acceptInvitation(qrData: String)
}
```

## Acceptance Criteria
- [ ] Conversations sorted by last message time
- [ ] Unread badges display correctly
- [ ] QR code generation works
- [ ] QR scanning establishes connection
- [ ] Empty state shown when no contacts
