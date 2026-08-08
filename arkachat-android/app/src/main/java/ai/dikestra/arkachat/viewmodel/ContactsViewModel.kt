package ai.dikestra.arkachat.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import ai.dikestra.arkachat.ArkAChatApp
import ai.dikestra.arkachat.bridge.ShieldSimplexBridge
import ai.dikestra.arkachat.model.Contact
import ai.dikestra.arkachat.model.ContactWithLastMessage
import ai.dikestra.arkachat.storage.ChatDatabase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ContactsViewModel(
    private val bridge: ShieldSimplexBridge,
    private val database: ChatDatabase
) : ViewModel() {

    private val contactsFlow = database.contactDao().getAllContacts()

    val contactsWithLastMessage: StateFlow<List<ContactWithLastMessage>> = contactsFlow
        .combine(MutableStateFlow(Unit)) { contacts, _ ->
            contacts.map { contact ->
                val lastMessage = database.messageDao().getLastMessage(contact.id)
                val unreadCount = database.messageDao().getUnreadCount(contact.id)
                ContactWithLastMessage(contact, lastMessage, unreadCount)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _invitationQR = MutableStateFlow<String?>(null)
    val invitationQR: StateFlow<String?> = _invitationQR

    private val _invitationError = MutableStateFlow<String?>(null)
    val invitationError: StateFlow<String?> = _invitationError

    val connectionState = bridge.connectionState

    suspend fun createInvitation(displayName: String): String? {
        _invitationError.value = null
        return try {
            val qrData = bridge.createInvitation(displayName)
            _invitationQR.value = qrData
            qrData
        } catch (e: Exception) {
            _invitationError.value = e.message ?: "Failed to generate QR code"
            null
        }
    }

    suspend fun acceptInvitation(qrData: String): Result<Contact> {
        return try {
            val contact = bridge.acceptInvitation(qrData)
            Result.success(contact)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun deleteContact(contactId: String) {
        viewModelScope.launch {
            database.messageDao().deleteAllForContact(contactId)
            database.contactDao().delete(contactId)
        }
    }

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val app = ArkAChatApp.instance
            return ContactsViewModel(
                bridge = app.bridge,
                database = app.database
            ) as T
        }
    }
}
