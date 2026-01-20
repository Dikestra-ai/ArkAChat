'use client';

import { useState } from 'react';
import {
  X,
  Users,
  Crown,
  UserMinus,
  UserPlus,
  LogOut,
  Pencil,
  Check,
  Loader2,
  Shield,
} from 'lucide-react';
import { useGroupChat, useGroupChatBridge } from '@/hooks/useGroupChat';
import { useChatStore } from '@/lib/storage/chatStore';

interface GroupSettingsModalProps {
  groupId: string;
  onClose: () => void;
}

export function GroupSettingsModal({ groupId, onClose }: GroupSettingsModalProps) {
  const {
    group,
    members,
    isAdmin,
    leave,
    updateName,
    addMember,
    removeMember,
    promote,
    demote,
    getContactForMember,
  } = useGroupChat(groupId);

  const contacts = useChatStore((state) => state.contacts);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(group?.name ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  // Get contacts not in group
  const availableContacts = contacts.filter(
    (c) => !members.some((m) => m.contactId === c.id)
  );

  const handleUpdateName = async () => {
    if (!newName.trim() || newName === group?.name) {
      setIsEditingName(false);
      return;
    }

    setIsLoading(true);
    try {
      await updateName(newName.trim());
      setIsEditingName(false);
    } catch (error) {
      console.error('Failed to update name:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = async (contactId: string) => {
    setIsLoading(true);
    try {
      await addMember(contactId);
      setShowAddMember(false);
    } catch (error) {
      console.error('Failed to add member:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async (contactId: string) => {
    if (!confirm('Remove this member from the group?')) return;

    setIsLoading(true);
    try {
      await removeMember(contactId);
    } catch (error) {
      console.error('Failed to remove member:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromote = async (contactId: string) => {
    setIsLoading(true);
    try {
      await promote(contactId);
    } catch (error) {
      console.error('Failed to promote member:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemote = async (contactId: string) => {
    setIsLoading(true);
    try {
      await demote(contactId);
    } catch (error) {
      console.error('Failed to demote member:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;

    setIsLoading(true);
    try {
      await leave();
      onClose();
    } catch (error) {
      console.error('Failed to leave group:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!group) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-green-600 text-white p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Group Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-green-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Group Name */}
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Group Name
            </label>
            {isEditingName ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
                <button
                  onClick={handleUpdateName}
                  disabled={isLoading}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsEditingName(false);
                    setNewName(group.name);
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-lg">{group.name}</span>
                {isAdmin && (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Encryption Info */}
          <div className="mb-6 bg-green-50 p-3 rounded-lg flex items-center">
            <Shield className="w-5 h-5 text-green-600 mr-2" />
            <span className="text-sm text-green-800">
              Messages are end-to-end encrypted
            </span>
          </div>

          {/* Members */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <Users className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Members ({members.length})
                </span>
              </div>
              {isAdmin && availableContacts.length > 0 && (
                <button
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="flex items-center text-sm text-green-600 hover:text-green-700"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Add
                </button>
              )}
            </div>

            {/* Add Member Dropdown */}
            {showAddMember && (
              <div className="mb-3 bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500 mb-2">Select contact to add:</p>
                {availableContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleAddMember(contact.id)}
                    disabled={isLoading}
                    className="w-full text-left p-2 hover:bg-gray-100 rounded-lg flex items-center justify-between"
                  >
                    <span>{contact.displayName}</span>
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4 text-green-600" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Member List */}
            <div className="space-y-2">
              {members.map((member) => {
                const isSelf = member.contactId === '';
                const contact = isSelf ? null : getContactForMember(member.contactId);
                const displayName = isSelf
                  ? 'You'
                  : contact?.displayName ?? member.displayName;
                const isAdminMember = member.role === 'admin';

                return (
                  <div
                    key={member.contactId}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                          isSelf ? 'bg-green-600' : 'bg-gray-400'
                        }`}
                      >
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-3">
                        <div className="flex items-center">
                          <span className="font-medium">{displayName}</span>
                          {isAdminMember && (
                            <Crown className="w-3 h-3 ml-1 text-yellow-500" />
                          )}
                        </div>
                        {isAdminMember && (
                          <span className="text-xs text-gray-500">Admin</span>
                        )}
                      </div>
                    </div>

                    {/* Admin actions for non-self members */}
                    {isAdmin && !isSelf && (
                      <div className="flex items-center space-x-1">
                        {isAdminMember ? (
                          <button
                            onClick={() => handleDemote(member.contactId)}
                            disabled={isLoading}
                            className="p-1.5 text-gray-500 hover:text-orange-600 rounded-full hover:bg-gray-100"
                            title="Remove admin"
                          >
                            <Crown className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePromote(member.contactId)}
                            disabled={isLoading}
                            className="p-1.5 text-gray-500 hover:text-yellow-600 rounded-full hover:bg-gray-100"
                            title="Make admin"
                          >
                            <Crown className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveMember(member.contactId)}
                          disabled={isLoading}
                          className="p-1.5 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100"
                          title="Remove from group"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leave Group */}
          <button
            onClick={handleLeave}
            disabled={isLoading}
            className="w-full flex items-center justify-center space-x-2 p-3 text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogOut className="w-5 h-5" />
                <span>Leave Group</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
