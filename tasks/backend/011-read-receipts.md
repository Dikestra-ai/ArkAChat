---
id: backend-011
title: "Read Receipts Implementation"
status: done
priority: high
tags: [backend, receipts, messages, android, web]
dependencies: [backend-008, backend-009]
assignee: developer
created: 2026-01-20T21:35:00Z
completed: 2026-01-20T22:30:00Z
estimate: 3h
complexity: 3
area: backend
---

# Read Receipts Implementation

## Context
Read receipts are partially implemented - the message envelope supports them but the
backend logic to send/receive them is incomplete. TODOs exist in:
- `ChatViewModel.kt:106` - "Send read receipts" ✅ FIXED
- `useChatBridge.ts:157` - "Send read receipts via bridge" ✅ FIXED

## Objectives
- Complete read receipt sending for 1:1 chats ✅
- Complete read receipt sending for group chats ✅
- Update UI to show read status ✅
- Handle offline receipt queueing (via existing message queue)

## Tasks

### Android
- [x] Implement `sendReadReceipt()` in `ShieldSimplexBridge.kt`
- [x] Implement `markAsRead()` with receipt sending in `ChatViewModel.kt`
- [x] Add `markMessageAsRead()` for individual messages in `ChatViewModel.kt`
- [x] Handle incoming read receipts in `ShieldSimplexBridge.kt` (already existed)
- [x] Update message status in database via `MessageDao.updateStatus()`
- [x] Added `getUnreadIncomingMessages()` query to `MessageDao.kt`

### Web
- [x] Implement `sendReadReceipt()` in `shieldSimplexBridge.ts`
- [x] Implement `sendGroupReadReceipt()` in `shieldSimplexBridge.ts`
- [x] Add `markAsRead()` and `markMessageAsRead()` in `useChatBridge.ts`
- [x] Use Intersection Observer for visibility detection in `MessageBubble.tsx`
- [x] Handle incoming read receipts in `shieldSimplexBridge.ts` (already existed)
- [x] Update Zustand store with read status
- [x] Show read indicator in UI (blue double-check)

### Group Chat
- [x] Send group read receipts via pairwise channel
- [x] Show "Seen by X" count in `GroupMessageBubble.tsx`
- [ ] Detailed read info on long-press (deferred - UI enhancement)

## Technical Details

### Read Receipt Envelope

```typescript
// For 1:1 chats
interface ReadReceiptEnvelope {
    type: 'READ_RECEIPT';
    messageId: string;       // ID of message being marked read
    replyToId: string;       // Same as messageId (for compatibility)
    timestamp: number;
}

// For group chats (already in GroupMessageEnvelope)
interface GroupReadReceipt {
    type: 'READ_RECEIPT';
    groupId: string;
    senderId: string;        // Who read the message
    messageId: string;
    replyToId: string;       // Message being marked read
    timestamp: number;
    keyId: string;
}
```

### Android Implementation

```kotlin
// ChatViewModel.kt
fun markMessageAsRead(messageId: String) {
    viewModelScope.launch {
        // Update local database
        messageDao.updateStatus(messageId, MessageStatus.READ)

        // Send read receipt to sender
        val message = messageDao.getById(messageId) ?: return@launch
        if (!message.isOutgoing && message.status != MessageStatus.READ) {
            bridge.sendReadReceipt(message.contactId, messageId)
        }
    }
}

// ShieldSimplexBridge.kt
suspend fun sendReadReceipt(contactId: String, messageId: String) {
    val envelope = MessageEnvelope(
        type = MessageType.READ_RECEIPT,
        messageId = UUID.randomUUID().toString(),
        timestamp = System.currentTimeMillis(),
        replyToId = messageId
    )

    val encrypted = shieldCrypto.encryptMessage(contactId, isInitiator, envelope.toJson())
    simplexClient.sendMessage(contactId, encrypted)
}
```

### Web Implementation

```typescript
// useChatBridge.ts
const sendReadReceipt = useCallback(async (contactId: string, messageId: string) => {
    const envelope: MessageEnvelope = {
        type: 'READ_RECEIPT',
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
        replyToId: messageId,
    };

    await bridge.sendMessage(contactId, envelope);
}, [bridge]);

// Use Intersection Observer for visibility
useEffect(() => {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const messageId = entry.target.dataset.messageId;
                    const message = messages.find(m => m.id === messageId);
                    if (message && !message.isOutgoing && message.status !== 'read') {
                        sendReadReceipt(contactId, messageId);
                    }
                }
            });
        },
        { threshold: 0.5 }
    );

    // Observe all unread incoming messages
    document.querySelectorAll('[data-unread="true"]').forEach(el => {
        observer.observe(el);
    });

    return () => observer.disconnect();
}, [messages, contactId, sendReadReceipt]);
```

### Handling Incoming Read Receipts

```kotlin
// ShieldSimplexBridge.kt - handleReadReceipt()
private suspend fun handleReadReceipt(contact: Contact, envelope: MessageEnvelope) {
    val originalMessageId = envelope.replyToId ?: return

    // Update the original message status
    database.messageDao().updateStatus(originalMessageId, MessageStatus.READ)

    // Notify UI
    _events.emit(ChatEvent.MessageRead(originalMessageId))
}
```

### UI Indicators

| Status | 1:1 Chat | Group Chat |
|--------|----------|------------|
| Sending | ○ (empty circle) | ○ |
| Sent | ✓ (single check) | ✓ |
| Delivered | ✓✓ (double check gray) | ✓✓ |
| Read | ✓✓ (double check blue) | "Seen by 3" |

## Files to Modify

### Android
- `viewmodel/ChatViewModel.kt` - Add `markMessageAsRead()`
- `viewmodel/GroupViewModel.kt` - Add group read receipt handling
- `bridge/ShieldSimplexBridge.kt` - Add `sendReadReceipt()`, `handleReadReceipt()`
- `ui/ChatScreen.kt` - Track message visibility

### Web
- `hooks/useChatBridge.ts` - Add `sendReadReceipt()`
- `lib/bridge/shieldSimplexBridge.ts` - Handle incoming receipts
- `components/MessageBubble.tsx` - Add visibility tracking
- `components/GroupMessageBubble.tsx` - Show "Seen by X"

## Acceptance Criteria
- [x] Read receipts sent when message viewed (1:1)
- [x] Read receipts sent when message viewed (group)
- [x] Sender sees blue double-check when read
- [x] Group shows "Seen by X" count
- [x] Works across Android and Web
- [x] Offline receipts queued and sent on reconnect (via existing queue)
