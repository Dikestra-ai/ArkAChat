---
id: backend-006
title: "Android: Shield + SimpleX Full Integration"
status: todo
priority: critical
tags: [android, shield, simplex, integration]
dependencies: [backend-004, backend-005]
assignee: developer
created: 2026-01-20T18:00:00Z
estimate: 4h
complexity: 4
area: backend
---

# Android: Shield + SimpleX Full Integration

## Context
Complete integration of Shield crypto library and SimpleX messaging for Android app.

## Objectives
- Wire up Shield RatchetSession with SimpleX message flow
- Implement secure contact pairing with QRExchange
- Handle encrypted message send/receive through SimpleX
- Store session state securely

## Tasks
- [ ] Update ShieldCrypto.kt to use real Shield imports
- [ ] Update SimpleXClient.kt to use simplex-chat library
- [ ] Implement ShieldSimplexBridge.kt to connect both
- [ ] Update ContactsViewModel for QRExchange pairing
- [ ] Update ChatViewModel for encrypted messaging
- [ ] Persist RatchetSession state in encrypted storage
- [ ] Handle session recovery after app restart
- [ ] Implement message retry on failure

## Technical Details

### ShieldSimplexBridge
```kotlin
class ShieldSimplexBridge(
    private val crypto: ShieldCrypto,
    private val simplex: SimpleXClient,
    private val db: ChatDatabase
) {
    suspend fun sendEncryptedMessage(contactId: String, plaintext: String) {
        val contact = db.contactDao().getById(contactId)
        val session = crypto.getSession(contactId, contact.isInitiator)

        // Encrypt with Shield
        val encrypted = session.encrypt(plaintext.toByteArray())

        // Send via SimpleX
        simplex.sendMessage(contact.simplexContactId, encrypted)

        // Persist session state
        crypto.persistSession(contactId, session)
    }

    suspend fun handleIncomingMessage(simplexMessage: SimplexMessage) {
        val contact = db.contactDao().getBySimplexId(simplexMessage.contactId)
        val session = crypto.getSession(contact.id, contact.isInitiator)

        // Decrypt with Shield
        val plaintext = session.decrypt(simplexMessage.content)

        // Save message
        db.messageDao().insert(Message(
            content = String(plaintext),
            contactId = contact.id,
            // ...
        ))
    }
}
```

### Contact Pairing with QRExchange
```kotlin
class ContactPairing(
    private val crypto: ShieldCrypto,
    private val simplex: SimpleXClient
) {
    suspend fun createInvitation(): String {
        // Create SimpleX connection request
        val simplexInvite = simplex.createConnection()

        // Create Shield QR exchange
        val qrExchange = QRExchange()
        val shieldData = qrExchange.generateInvitation()

        // Combine into single QR
        return Json.encodeToString(PairingInvitation(
            simplex = simplexInvite.connReqContact,
            shield = shieldData,
            timestamp = System.currentTimeMillis()
        ))
    }

    suspend fun acceptInvitation(qrData: String): Contact {
        val invitation = Json.decodeFromString<PairingInvitation>(qrData)

        // Accept SimpleX connection
        val simplexContact = simplex.acceptConnection(invitation.simplex)

        // Complete Shield key exchange
        val qrExchange = QRExchange()
        val sharedKey = qrExchange.acceptInvitation(invitation.shield)

        // Create contact with shared key
        return createContact(simplexContact, sharedKey)
    }
}
```

## Acceptance Criteria
- [ ] Messages encrypted with Shield before SimpleX send
- [ ] Messages decrypted with Shield after SimpleX receive
- [ ] QR pairing establishes both SimpleX connection and Shield key
- [ ] Session state persists across app restarts
- [ ] Failed messages retry automatically
