---
id: backend-003
title: "Local Storage with Room Database"
status: todo
priority: high
tags: [storage, room, database, android]
dependencies: [setup-002]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 3h
complexity: 3
area: backend
---

# Local Storage with Room Database

## Context
Implement encrypted local storage for messages, contacts, and app settings using Room database with SQLCipher.

## Objectives
- Set up Room database with encrypted storage
- Create data models and DAOs
- Implement encrypted shared preferences for settings

## Tasks
- [ ] Create `ChatDatabase.kt` Room database
- [ ] Define `Message` entity and `MessageDao`
- [ ] Define `Contact` entity and `ContactDao`
- [ ] Define `Conversation` entity and `ConversationDao`
- [ ] Create `EncryptedPrefs.kt` for settings
- [ ] Add database migrations strategy

## Technical Details

### Data Models
```kotlin
@Entity(tableName = "messages")
data class Message(
    @PrimaryKey val id: String,
    val conversationId: String,
    val content: String,      // Decrypted for display
    val timestamp: Long,
    val isSent: Boolean,
    val isDelivered: Boolean,
    val isRead: Boolean,
    val mediaType: MediaType? = null,
    val mediaPath: String? = null
)

@Entity(tableName = "contacts")
data class Contact(
    @PrimaryKey val id: String,
    val displayName: String,
    val queueAddress: String,  // Encrypted
    val sharedKeyId: String,   // Reference to Keystore
    val createdAt: Long,
    val lastMessageAt: Long?
)

@Entity(tableName = "conversations")
data class Conversation(
    @PrimaryKey val id: String,
    val contactId: String,
    val lastMessage: String?,
    val unreadCount: Int,
    val updatedAt: Long
)
```

### EncryptedPrefs
```kotlin
class EncryptedPrefs(context: Context) {
    fun setString(key: String, value: String)
    fun getString(key: String): String?
    fun setBoolean(key: String, value: Boolean)
    fun getBoolean(key: String): Boolean
}
```

## Acceptance Criteria
- [ ] Database creates without errors
- [ ] CRUD operations work for all entities
- [ ] Data persists across app restarts
- [ ] Database encrypted at rest
