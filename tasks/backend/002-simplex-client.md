---
id: backend-002
title: "SimpleX Protocol Client"
status: todo
priority: high
tags: [network, simplex, websocket, android]
dependencies: [setup-002]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 6h
complexity: 5
area: backend
---

# SimpleX Protocol Client

## Context
Implement the SimpleX messaging protocol client for zero-identifier messaging via WebSocket transport.

## Objectives
- Create WebSocket client for SimpleX Message Protocol (SMP)
- Implement message queue management
- Handle connection lifecycle and reconnection
- Support push notification registration

## Tasks
- [ ] Create `SimpleXClient.kt` WebSocket client
- [ ] Implement `MessageQueue.kt` for queue management
- [ ] Add connection state management
- [ ] Implement message sending with delivery confirmation
- [ ] Implement message receiving with queue polling
- [ ] Add automatic reconnection logic
- [ ] Create `ConnectionInvitation` for QR code pairing

## Technical Details

### SimpleX Architecture
- Ephemeral message queues (deleted after delivery)
- No user identifiers (pairwise queue IDs only)
- WebSocket transport (works on cellular)
- Self-hostable servers

### SimpleXClient API
```kotlin
class SimpleXClient(
    private val serverUrl: String = "wss://smp.simplex.im"
) {
    suspend fun connect()
    suspend fun disconnect()
    suspend fun createQueue(): QueueAddress
    suspend fun deleteQueue(address: QueueAddress)
    suspend fun sendMessage(queueId: String, encrypted: ByteArray)
    fun receiveMessages(): Flow<EncryptedMessage>
    fun connectionState(): StateFlow<ConnectionState>
}

data class QueueAddress(
    val queueId: String,
    val recipientKey: ByteArray,
    val senderKey: ByteArray
)
```

### Message Flow
1. Create queue → get queue address
2. Share address via QR/link (out of band)
3. Sender connects to queue
4. Messages flow through queue
5. Queue deleted after delivery confirmed

## Acceptance Criteria
- [ ] Can connect to SimpleX server
- [ ] Can create and manage queues
- [ ] Messages delivered reliably
- [ ] Automatic reconnection works
- [ ] Connection state observable
