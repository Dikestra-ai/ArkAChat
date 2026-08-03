package ai.dikestra.arkachat.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import ai.dikestra.arkachat.ArkAChatApp
import ai.dikestra.arkachat.bridge.ShieldSimplexBridge
import ai.dikestra.arkachat.model.Contact
import ai.dikestra.arkachat.model.Group
import ai.dikestra.arkachat.model.GroupMember
import ai.dikestra.arkachat.model.MemberRole
import ai.dikestra.arkachat.model.Message
import ai.dikestra.arkachat.network.ConnectionState
import ai.dikestra.arkachat.storage.ChatDatabase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class GroupViewModel(
    private val groupId: String,
    private val bridge: ShieldSimplexBridge,
    private val database: ChatDatabase
) : ViewModel() {

    val messages: StateFlow<List<Message>> = bridge.getGroupMessages(groupId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val members: StateFlow<List<GroupMember>> = bridge.getGroupMembers(groupId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val connectionState: StateFlow<ConnectionState> = bridge.connectionState

    private val _group = MutableStateFlow<Group?>(null)
    val group: StateFlow<Group?> = _group

    private val _isAdmin = MutableStateFlow(false)
    val isAdmin: StateFlow<Boolean> = _isAdmin

    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    init {
        viewModelScope.launch {
            val groupDao = database.groupDao()
            _group.value = groupDao.getGroupById(groupId)
            _isAdmin.value = bridge.isAdmin(groupId)
        }
    }

    fun sendMessage(text: String) {
        if (text.isBlank() || _isSending.value) return

        viewModelScope.launch {
            _isSending.value = true
            try {
                bridge.sendGroupMessage(groupId, text)
            } catch (e: Exception) {
                _error.value = "Failed to send message"
                e.printStackTrace()
            } finally {
                _isSending.value = false
            }
        }
    }

    fun addMember(contactId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                bridge.addGroupMember(groupId, contactId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to add member"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun removeMember(contactId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                bridge.removeGroupMember(groupId, contactId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to remove member"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun promoteToAdmin(contactId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                bridge.promoteToAdmin(groupId, contactId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to promote member"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun demoteToMember(contactId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                bridge.demoteToMember(groupId, contactId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to demote member"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun updateGroupName(newName: String) {
        if (newName.isBlank()) return

        viewModelScope.launch {
            _isLoading.value = true
            try {
                bridge.updateGroupName(groupId, newName)
                _group.value = _group.value?.copy(name = newName)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to update group name"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun leaveGroup(onComplete: () -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                bridge.leaveGroup(groupId)
                onComplete()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to leave group"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun clearError() {
        _error.value = null
    }

    fun getMemberDisplayName(member: GroupMember): String {
        return if (member.contactId.isEmpty()) "You" else member.displayName
    }

    class Factory(private val groupId: String) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val app = ArkAChatApp.instance
            return GroupViewModel(
                groupId = groupId,
                bridge = app.bridge,
                database = app.database
            ) as T
        }
    }
}

/**
 * ViewModel for the group list screen.
 */
class GroupListViewModel(
    private val bridge: ShieldSimplexBridge,
    private val database: ChatDatabase
) : ViewModel() {

    val groups: StateFlow<List<Group>> = bridge.getGroups()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val contacts: StateFlow<List<Contact>> = database.contactDao().getAllContacts()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _isCreating = MutableStateFlow(false)
    val isCreating: StateFlow<Boolean> = _isCreating

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    fun createGroup(name: String, memberContactIds: List<String>, onSuccess: (Group) -> Unit) {
        if (name.isBlank() || memberContactIds.isEmpty()) {
            _error.value = "Please enter a name and select members"
            return
        }

        viewModelScope.launch {
            _isCreating.value = true
            try {
                val group = bridge.createGroup(name, memberContactIds)
                onSuccess(group)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to create group"
            } finally {
                _isCreating.value = false
            }
        }
    }

    fun clearError() {
        _error.value = null
    }

    class Factory : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            val app = ArkAChatApp.instance
            return GroupListViewModel(
                bridge = app.bridge,
                database = app.database
            ) as T
        }
    }
}
