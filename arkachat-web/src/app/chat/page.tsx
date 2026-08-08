'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Users } from 'lucide-react';
import { ContactList } from '@/components/ContactList';
import { ChatWindow } from '@/components/ChatWindow';
import { GroupList } from '@/components/GroupList';
import { GroupChatWindow } from '@/components/GroupChatWindow';
import { useChatStore } from '@/lib/storage/chatStore';
import { Group } from '@/lib/storage/groupStore';

type SidebarTab = 'chats' | 'groups';

export default function ChatPage() {
  const [mounted, setMounted] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chats');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

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

  const handleTabChange = (tab: SidebarTab) => {
    setSidebarTab(tab);
    // Clear selection in the other panel
    if (tab === 'chats') setSelectedGroup(null);
  };

  // Determine what to show in the main panel
  const showGroupChat = sidebarTab === 'groups' && selectedGroup;
  const showDirectChat = sidebarTab === 'chats' && selectedContact;

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Tab switcher */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => handleTabChange('chats')}
            className={`flex-1 py-3 flex items-center justify-center space-x-1 text-sm font-medium transition ${
              sidebarTab === 'chats'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Chats</span>
          </button>
          <button
            onClick={() => handleTabChange('groups')}
            className={`flex-1 py-3 flex items-center justify-center space-x-1 text-sm font-medium transition ${
              sidebarTab === 'groups'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Groups</span>
          </button>
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {sidebarTab === 'chats' ? (
            <ContactList />
          ) : (
            <GroupList
              onSelectGroup={setSelectedGroup}
              selectedGroupId={selectedGroup?.id}
            />
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col">
        {showGroupChat ? (
          <GroupChatWindow group={selectedGroup} />
        ) : showDirectChat ? (
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
