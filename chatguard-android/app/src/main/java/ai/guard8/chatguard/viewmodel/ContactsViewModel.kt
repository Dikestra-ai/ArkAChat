package ai.guard8.chatguard.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import ai.guard8.chatguard.ChatGuardApp
import ai.guard8.chatguard.bridge.ShieldSimplexBridge
import ai.guard8.chatguard.model.Contact
import ai.guard8.chatguard.model.ContactWithLastMessage
import ai.guard8.chatguard.storage.ChatDatabase
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

    val connectionState = bridge.connectionState

    suspend fun createInvitation(displayName: String): String {
        val qrData = bridge.createInvitation(displayName)
        _invitationQR.value = qrData
        return qrData
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
            val app = ChatGuardApp.instance
            return ContactsViewModel(
                bridge = app.bridge,
                database = app.database
            ) as T
        }
    }
}
