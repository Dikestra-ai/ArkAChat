---
id: frontend-006
title: "Android Chat UI Integration with ShieldSimplexBridge"
status: done
priority: critical
tags: [android, ui, jetpack-compose, integration]
dependencies: [backend-008]
assignee: developer
created: 2026-01-20T21:00:00Z
estimate: 4h
complexity: 3
area: frontend
---

# Android Chat UI Integration with ShieldSimplexBridge

## Context
Wire the existing Jetpack Compose chat UI to the ShieldSimplexBridge for end-to-end encrypted messaging.

## Objectives
- Connect ChatScreen to ShieldSimplexBridge
- Enable QR code scanning and generation for contact pairing
- Display message status (sending, sent, delivered, read)
- Support file attachment sending and receiving

## Tasks
- [ ] Create ChatViewModel with ShieldSimplexBridge injection
- [ ] Update ChatScreen to use ChatViewModel
- [ ] Implement QR code generation for contact invitation
- [ ] Implement QR code scanning for accepting invitations
- [ ] Wire send button to sendTextMessage
- [ ] Wire file attachment to sendFile
- [ ] Display message delivery/read status indicators
- [ ] Handle incoming messages in real-time
- [ ] Add typing indicators
- [ ] Implement pull-to-refresh for message history

## Technical Details

### ChatViewModel
```kotlin
@HiltViewModel
class ChatViewModel @Inject constructor(
    private val bridge: ShieldSimplexBridge,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val contactId: String = savedStateHandle["contactId"]!!

    val messages = bridge.messageDao.getMessagesForContact(contactId)
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    val contact = bridge.contactDao.getByIdFlow(contactId)
        .stateIn(viewModelScope, SharingStarted.Lazily, null)

    fun sendMessage(text: String) {
        viewModelScope.launch {
            bridge.sendTextMessage(contactId, text)
        }
    }

    fun sendFile(uri: Uri) {
        viewModelScope.launch {
            val file = uri.toFile(context)
            bridge.sendFile(contactId, file, null)
        }
    }

    fun markAsRead() {
        viewModelScope.launch {
            bridge.messageDao.markAllRead(contactId)
            // Send read receipts for unread messages
        }
    }
}
```

### ChatScreen Updates
```kotlin
@Composable
fun ChatScreen(
    contactId: String,
    viewModel: ChatViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    val messages by viewModel.messages.collectAsState()
    val contact by viewModel.contact.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.markAsRead()
    }

    Column(modifier = Modifier.fillMaxSize()) {
        ChatTopBar(contact = contact, onBack = onNavigateBack)

        MessageList(
            messages = messages,
            modifier = Modifier.weight(1f)
        )

        MessageInput(
            onSendMessage = viewModel::sendMessage,
            onAttachFile = viewModel::sendFile
        )
    }
}
```

### Message Status UI
```kotlin
@Composable
fun MessageStatusIcon(status: MessageStatus) {
    when (status) {
        MessageStatus.SENDING -> CircularProgressIndicator(size = 12.dp)
        MessageStatus.SENT -> Icon(Icons.Default.Check, "Sent")
        MessageStatus.DELIVERED -> Icon(Icons.Default.DoneAll, "Delivered")
        MessageStatus.READ -> Icon(Icons.Default.DoneAll, "Read", tint = Color.Blue)
        MessageStatus.FAILED -> Icon(Icons.Default.Error, "Failed", tint = Color.Red)
    }
}
```

## Files to Modify
- `ui/chat/ChatViewModel.kt` - Create new
- `ui/chat/ChatScreen.kt` - Update
- `ui/chat/components/MessageBubble.kt` - Add status indicators
- `ui/chat/components/MessageInput.kt` - Add file attachment
- `ui/contacts/ContactsScreen.kt` - Add QR scan/generate buttons
- `ui/contacts/QRScannerScreen.kt` - Create new
- `ui/contacts/QRGeneratorScreen.kt` - Create new

## Acceptance Criteria
- [ ] Messages send and receive in real-time
- [ ] QR code pairing works for new contacts
- [ ] Message status updates correctly
- [ ] Files can be attached and sent
- [ ] Typing indicators show for active contacts
