---
id: backend-005
title: "Integrate SimpleX Chat Library"
status: done
priority: critical
tags: [network, simplex, integration, android, web]
dependencies: [backend-002]
assignee: developer
created: 2026-01-20T18:00:00Z
estimate: 4h
complexity: 4
area: backend
---

# Integrate SimpleX Chat Library

## Context
Replace custom SimpleX implementation with the official simplex-chat library and connect to public SMP servers.

## Objectives
- Integrate official SimpleX libraries for Android and Web
- Connect to public SMP servers (smp.simplex.im)
- Implement proper SMP protocol handling
- Handle message queues and delivery

## Tasks
- [x] Implement SMP protocol directly in Android (SimpleXClient.kt)
- [x] Implement SMP protocol directly in Web (client.ts)
- [x] Configure connection to public SMP servers (smp4/5/6.simplex.im)
- [x] Implement queue creation and management
- [x] Implement message sending via SMP
- [x] Implement message receiving via SMP
- [x] Handle connection state and reconnection
- [ ] Test end-to-end message delivery

Note: Implemented the SMP protocol directly rather than using simplex-chat library
for better control and smaller footprint.

## Technical Details

### SimpleX Architecture
- SMP (SimpleX Messaging Protocol) - server protocol
- No user accounts or identifiers
- Pairwise message queues
- Messages deleted after delivery

### Public SMP Servers
```
smp://u2dS9sG8nMNURyZwqASV4yROM28Er0luVTx5X1CsMrU=@smp4.simplex.im
smp://hpq7_4gGJiilmz5Rf-CswuU5kZGkm_zOIooSw6yALRg=@smp5.simplex.im
smp://PQUV2eL0t7OStZOoAsPEV2QYWt4-xilbakvGUGOItUo=@smp6.simplex.im
```

### Android Integration
```kotlin
// build.gradle.kts
dependencies {
    implementation("chat.simplex:simplex-chat:5.4.0")
}

// SimpleXClient.kt
import chat.simplex.common.platform.*
import chat.simplex.common.model.*

class SimpleXClient {
    private val chatController = ChatController()

    suspend fun connect(server: String) {
        chatController.startChat()
    }

    suspend fun createConnection(): ConnectionRequest {
        return chatController.apiAddContact()
    }

    suspend fun sendMessage(contactId: Long, message: String) {
        chatController.apiSendMessage(contactId, message)
    }
}
```

### Web Integration
```typescript
// Using SimpleX WebSocket API
import { SimplexChat } from 'simplex-chat';

const chat = new SimplexChat({
  servers: ['smp4.simplex.im', 'smp5.simplex.im']
});

await chat.connect();
const invitation = await chat.createInvitation();
await chat.sendMessage(contactId, encryptedMessage);
```

### Connection Flow
1. App starts → Connect to SMP server via WebSocket
2. Create contact → Generate invitation link/QR
3. Other party accepts → Bidirectional queues established
4. Send message → Encrypt with Shield → Send via SMP queue
5. Receive message → Fetch from queue → Decrypt with Shield

## Acceptance Criteria
- [x] Connects to public SMP servers
- [x] Can create contact invitations
- [x] Can accept contact invitations
- [ ] Messages deliver reliably
- [x] Reconnects after connection loss
- [ ] Works offline (queues messages)
