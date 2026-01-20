---
id: frontend-001
title: "Chat Screen UI (Jetpack Compose)"
status: todo
priority: high
tags: [ui, compose, android, chat]
dependencies: [backend-001, backend-003]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 4h
complexity: 3
area: frontend
---

# Chat Screen UI (Jetpack Compose)

## Context
Implement the main chat interface using Jetpack Compose with Material 3 design, matching the architecture in ChatGuard.md.

## Objectives
- Create ChatScreen composable with message list
- Implement MessageBubble with sent/received styling
- Add message input with send button
- Show quantum-safe indicator (Shield icon)

## Tasks
- [ ] Create `ChatScreen.kt` main composable
- [ ] Implement `MessageBubble.kt` component
- [ ] Create `MessageInput.kt` with text field and send button
- [ ] Add `ChatTopBar.kt` with contact name and security indicator
- [ ] Implement `ChatViewModel.kt` for state management
- [ ] Add image/media attachment button
- [ ] Implement scroll to bottom on new message

## Technical Details

### ChatScreen Structure
```kotlin
@Composable
fun ChatScreen(
    contactName: String,
    messages: List<Message>,
    onSendMessage: (String) -> Unit,
    onSendImage: () -> Unit,
    onBackClick: () -> Unit
)
```

### Theme Colors
- Sent messages: `MaterialTheme.colorScheme.primaryContainer`
- Received messages: `MaterialTheme.colorScheme.secondaryContainer`
- Security indicator: Green Shield icon

### ChatViewModel
```kotlin
class ChatViewModel(
    private val contactId: String,
    private val crypto: ShieldCrypto,
    private val simplex: SimpleXClient,
    private val db: ChatDatabase
) : ViewModel() {
    val messages: StateFlow<List<Message>>
    val connectionState: StateFlow<ConnectionState>

    fun sendMessage(text: String)
    fun sendMedia(uri: Uri)
}
```

## Acceptance Criteria
- [ ] Messages display correctly (sent right, received left)
- [ ] Timestamps shown on messages
- [ ] Keyboard doesn't overlap input
- [ ] Scroll behavior is smooth
- [ ] Security indicator visible
