package ai.guard8.chatguard.viewmodel

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import ai.guard8.chatguard.ChatGuardApp
import ai.guard8.chatguard.bridge.ShieldSimplexBridge
import ai.guard8.chatguard.model.Contact
import ai.guard8.chatguard.model.Message
import ai.guard8.chatguard.model.MessageStatus
import ai.guard8.chatguard.network.ConnectionState
import ai.guard8.chatguard.storage.ChatDatabase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File

class ChatViewModel(
    private val contactId: String,
    private val bridge: ShieldSimplexBridge,
    private val database: ChatDatabase
) : ViewModel() {

    val messages: StateFlow<List<Message>> = bridge.getMessages(contactId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val connectionState: StateFlow<ConnectionState> = bridge.connectionState

    private val _contact = MutableStateFlow<Contact?>(null)
    val contact: StateFlow<Contact?> = _contact

    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending

    init {
        viewModelScope.launch {
            _contact.value = database.contactDao().getById(contactId)
            // Mark messages as read when opening chat
            database.messageDao().markAllRead(contactId)
        }
    }

    fun sendMessage(text: String) {
        if (text.isBlank() || _isSending.value) return

        viewModelScope.launch {
            _isSending.value = true
            try {
                // Send via bridge (handles encryption + SimpleX)
                bridge.sendTextMessage(contactId, text)

                // Update contact last message time
                database.contactDao().updateLastMessageAt(contactId, System.currentTimeMillis())

            } catch (e: Exception) {
                // Handle send failure
                e.printStackTrace()
            } finally {
                _isSending.value = false
            }
        }
    }

    fun sendFile(file: File) {
        viewModelScope.launch {
            _isSending.value = true
            try {
                bridge.sendFile(contactId, file, null)
                database.contactDao().updateLastMessageAt(contactId, System.currentTimeMillis())
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                _isSending.value = false
            }
        }
    }

    fun downloadFileDecrypted(fileId: String, onComplete: (ByteArray) -> Unit) {
        viewModelScope.launch {
            try {
                val data = bridge.downloadFileDecrypted(contactId, fileId)
                onComplete(data)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun downloadFileEncrypted(fileId: String, onComplete: (ByteArray) -> Unit) {
        viewModelScope.launch {
            try {
                val data = bridge.downloadFileEncrypted(contactId, fileId)
                onComplete(data)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun markAsRead() {
        viewModelScope.launch {
            // Get unread incoming messages before marking
            val unreadMessages = database.messageDao()
                .getUnreadIncomingMessages(contactId)

            // Mark all messages as read locally
            database.messageDao().markAllRead(contactId)

            // Send read receipts for each unread incoming message
            for (message in unreadMessages) {
                try {
                    bridge.sendReadReceipt(contactId, message.id)
                } catch (e: Exception) {
                    // Don't fail the whole operation if one receipt fails
                    e.printStackTrace()
                }
            }
        }
    }

    /**
     * Mark a specific message as read and send receipt.
     */
    fun markMessageAsRead(messageId: String) {
        viewModelScope.launch {
            val message = database.messageDao().getById(messageId) ?: return@launch

            // Only send receipts for incoming messages that aren't already read
            if (!message.isOutgoing && message.status != MessageStatus.READ) {
                database.messageDao().updateStatus(messageId, MessageStatus.READ)
                try {
                    bridge.sendReadReceipt(contactId, messageId)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    fun deleteMessage(messageId: String) {
        viewModelScope.launch {
            database.messageDao().delete(messageId)
        }
    }

    class Factory(private val contactId: String) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val app = ChatGuardApp.instance
            return ChatViewModel(
                contactId = contactId,
                bridge = app.bridge,
                database = app.database
            ) as T
        }
    }
}
