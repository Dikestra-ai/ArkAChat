'use client';

import { useState } from 'react';
import { Shield, Plus, Settings, Search } from 'lucide-react';
import { useChatStore, Contact } from '@/lib/storage/chatStore';
import { NewContactModal } from './NewContactModal';
import { SettingsModal } from './SettingsModal';

export function ContactList() {
  const [showNewContact, setShowNewContact] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const contacts = useChatStore((state) => state.contacts);
  const selectedContactId = useChatStore((state) => state.selectedContactId);
  const selectContact = useChatStore((state) => state.selectContact);
  const getUnreadCount = useChatStore((state) => state.getUnreadCount);
  const getLastMessage = useChatStore((state) => state.getLastMessage);

  // Sort contacts by last message time
  const sortedContacts = [...contacts].sort((a, b) => {
    const aTime = a.lastMessageAt || a.createdAt;
    const bTime = b.lastMessageAt || b.createdAt;
    return bTime - aTime;
  });

  // Filter by search
  const filteredContacts = sortedContacts.filter((c) =>
    c.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Shield className="w-6 h-6 text-green-400" />
            <span className="text-xl font-bold">ArkAChat</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowNewContact(true)}
              className="p-2 rounded-full hover:bg-blue-700"
              title="New contact"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full hover:bg-blue-700"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-blue-700 text-white placeholder-blue-300 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Shield className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">No contacts yet</p>
            <button
              onClick={() => setShowNewContact(true)}
              className="mt-4 text-blue-600 hover:underline text-sm"
            >
              Add your first contact
            </button>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <ContactItem
              key={contact.id}
              contact={contact}
              isSelected={contact.id === selectedContactId}
              unreadCount={getUnreadCount(contact.id)}
              lastMessage={getLastMessage(contact.id)}
              onClick={() => selectContact(contact.id)}
            />
          ))
        )}
      </div>

      {showNewContact && (
        <NewContactModal onClose={() => setShowNewContact(false)} />
      )}

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}

interface ContactItemProps {
  contact: Contact;
  isSelected: boolean;
  unreadCount: number;
  lastMessage?: { content: string; timestamp: number; isOutgoing: boolean };
  onClick: () => void;
}

function ContactItem({
  contact,
  isSelected,
  unreadCount,
  lastMessage,
  onClick,
}: ContactItemProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition ${
        isSelected ? 'bg-blue-50' : ''
      }`}
    >
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
        <span className="text-blue-600 font-semibold">
          {contact.displayName.slice(0, 2).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between">
          <span
            className={`font-medium truncate ${
              unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'
            }`}
          >
            {contact.displayName}
          </span>
          {lastMessage && (
            <span
              className={`text-xs ${
                unreadCount > 0 ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              {formatTime(lastMessage.timestamp)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm text-gray-500 truncate">
            {lastMessage
              ? `${lastMessage.isOutgoing ? 'You: ' : ''}${lastMessage.content}`
              : 'No messages'}
          </span>
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 ml-2">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
