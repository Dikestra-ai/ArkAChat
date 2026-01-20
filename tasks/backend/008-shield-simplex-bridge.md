---
id: backend-008
title: "Shield-SimpleX Bridge Integration"
status: done
priority: critical
tags: [integration, shield, simplex, messaging, android, web]
dependencies: [backend-004, backend-005, backend-007]
assignee: developer
created: 2026-01-20T19:30:00Z
estimate: 4h
complexity: 4
area: backend
---

# Shield-SimpleX Bridge Integration

## Context
Integration layer that connects Shield encryption with SimpleX messaging protocol.
This bridge handles all encrypted message flow between contacts.

## Objectives
- Wire Shield encryption with SimpleX message sending/receiving
- Handle QR-based contact pairing with combined Shield key + SimpleX queue
- Support encrypted file transfers
- Implement message receipts (delivery, read)

## Tasks
- [x] Create `ShieldSimplexBridge.kt` for Android
- [x] Create `shieldSimplexBridge.ts` for Web
- [x] Implement message envelope format with type, metadata, content
- [x] Connect Shield `encryptMessage`/`decryptMessage` with SimpleX send/receive
- [x] Implement QR invitation creation (Shield key + SimpleX queue URI)
- [x] Implement QR invitation acceptance
- [x] Handle text messages
- [x] Handle file messages (reference + embedded data)
- [x] Implement delivery receipts
- [x] Implement read receipts
- [x] Update Contact and Message models
- [x] Update DAOs with new queries

## Technical Details

### Message Envelope Format
```kotlin
data class MessageEnvelope(
    val type: MessageType,       // TEXT, FILE, FILE_REQUEST, DELIVERY_RECEIPT, etc.
    val messageId: String,
    val timestamp: Long,
    val content: String?,        // For text messages
    val fileId: String?,         // For file messages
    val fileMetadata: FileMetadataDto?,
    val replyToId: String?       // For receipts and replies
)
```

### QR Invitation Format
```json
{
  "uri": "smp://server#queueId/recipientKey/senderKey",
  "k": "base64url_encoded_shield_key",
  "n": "Display Name",
  "ts": 1705780000000
}
```

### Flow: Send Text Message
1. Create MessageEnvelope with TEXT type
2. Serialize to JSON
3. Encrypt with Shield RatchetSession
4. Send via SimpleX SMP queue
5. Update local database with SENT status

### Flow: Receive Text Message
1. Receive encrypted bytes from SimpleX
2. Find contact by queue address
3. Decrypt with Shield RatchetSession
4. Parse MessageEnvelope
5. Store message in database
6. Send delivery receipt

### Flow: Send File
1. Encrypt file with Shield StreamCipher → EncryptedFileStorage
2. Create MessageEnvelope with FILE type + fileId
3. For small files (<64KB): embed encrypted data
4. For large files: send reference only
5. Encrypt envelope and send via SimpleX

## Files Created/Modified

### Android
- `bridge/ShieldSimplexBridge.kt` - Main bridge implementation
- `storage/EncryptedFileStorage.kt` - Encrypted file storage
- `model/Contact.kt` - Updated with simplexQueueUri
- `model/Message.kt` - Updated with status, fileId, replyToId
- `storage/ContactDao.kt` - Added getBySimplexQueueUri
- `storage/MessageDao.kt` - Added updateStatus, getByFileId

### Web
- `lib/bridge/shieldSimplexBridge.ts` - Main bridge implementation
- `lib/storage/encryptedFileStorage.ts` - Encrypted file storage
- `lib/storage/chatStore.ts` - Updated types and methods

## Acceptance Criteria
- [x] Messages encrypted before sending
- [x] Messages decrypted after receiving
- [x] QR pairing creates valid Shield + SimpleX connection
- [x] Files stored encrypted at rest
- [x] Files downloadable encrypted or decrypted
- [x] Delivery receipts update message status
- [ ] Read receipts update message status
- [ ] Cross-platform compatibility verified
