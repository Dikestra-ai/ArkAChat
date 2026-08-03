'use client';

import { useState } from 'react';
import { X, Users, Check, Loader2 } from 'lucide-react';
import { useChatStore, Contact } from '@/lib/storage/chatStore';
import { useGroupChatBridge } from '@/hooks/useGroupChat';

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated?: (groupId: string) => void;
}

export function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contacts = useChatStore((state) => state.contacts);
  const { createGroup } = useGroupChatBridge();

  const toggleContact = (contactId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Please enter a group name');
      return;
    }

    if (selectedContacts.length === 0) {
      setError('Please select at least one member');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const group = await createGroup(groupName.trim(), selectedContacts);
      if (group) {
        onCreated?.(group.id);
        onClose();
      } else {
        setError('Failed to create group');
      }
    } catch (err) {
      console.error('Failed to create group:', err);
      setError('Failed to create group');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-green-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center">
            <Users className="w-5 h-5 mr-2" />
            <h2 className="text-lg font-semibold">New Group</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-green-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Group Name Input */}
          <div className="mb-6">
            <label
              htmlFor="groupName"
              className="text-sm font-medium text-gray-700 block mb-2"
            >
              Group Name
            </label>
            <input
              id="groupName"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              className="w-full border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
          </div>

          {/* Contact Selection */}
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Select Members ({selectedContacts.length} selected)
            </label>

            {contacts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>No contacts available</p>
                <p className="text-sm">Add contacts first to create a group</p>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {contacts.map((contact) => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    selected={selectedContacts.includes(contact.id)}
                    onToggle={() => toggleContact(contact.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={isCreating || !groupName.trim() || selectedContacts.length === 0}
            className={`w-full flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition ${
              isCreating || !groupName.trim() || selectedContacts.length === 0
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Users className="w-5 h-5" />
                <span>Create Group</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ContactItemProps {
  contact: Contact;
  selected: boolean;
  onToggle: () => void;
}

function ContactItem({ contact, selected, onToggle }: ContactItemProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center p-3 rounded-lg transition ${
        selected
          ? 'bg-green-50 border-2 border-green-500'
          : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
          selected ? 'bg-green-600' : 'bg-gray-400'
        }`}
      >
        {contact.displayName.charAt(0).toUpperCase()}
      </div>
      <span className="ml-3 flex-1 text-left font-medium">
        {contact.displayName}
      </span>
      {selected && <Check className="w-5 h-5 text-green-600" />}
    </button>
  );
}
