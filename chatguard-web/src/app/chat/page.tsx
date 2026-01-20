'use client';

import { useEffect, useState } from 'react';
import { ContactList } from '@/components/ContactList';
import { ChatWindow } from '@/components/ChatWindow';
import { useChatStore } from '@/lib/storage/chatStore';

export default function ChatPage() {
  const [mounted, setMounted] = useState(false);
  const { selectedContactId, contacts, initialize } = useChatStore();

  useEffect(() => {
    setMounted(true);
    initialize();
  }, [initialize]);

  if (!mounted) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const selectedContact = contacts.find((c) => c.id === selectedContactId);

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar - Contacts */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <ContactList />
      </div>

      {/* Main - Chat */}
      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <ChatWindow contact={selectedContact} />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-500">
              <p className="text-lg">Select a conversation</p>
              <p className="text-sm">or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
