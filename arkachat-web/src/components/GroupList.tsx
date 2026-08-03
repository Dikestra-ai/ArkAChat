'use client';

import { useState } from 'react';
import { Users, Plus, MessageCircle } from 'lucide-react';
import { useGroupStore, Group } from '@/lib/storage/groupStore';
import { CreateGroupModal } from './CreateGroupModal';

interface GroupListProps {
  onSelectGroup: (group: Group) => void;
  selectedGroupId?: string;
}

export function GroupList({ onSelectGroup, selectedGroupId }: GroupListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const groups = useGroupStore((state) => state.groups);
  const messages = useGroupStore((state) => state.messages);

  // Sort groups by last message time
  const sortedGroups = [...groups].sort((a, b) => {
    const aTime = a.lastMessageAt ?? a.createdAt;
    const bTime = b.lastMessageAt ?? b.createdAt;
    return bTime - aTime;
  });

  const getUnreadCount = (groupId: string): number => {
    const groupMessages = messages[groupId] || [];
    return groupMessages.filter((m) => !m.isOutgoing && m.status !== 'read').length;
  };

  const getLastMessage = (groupId: string): string => {
    const groupMessages = messages[groupId] || [];
    if (groupMessages.length === 0) return 'No messages yet';
    const last = groupMessages[groupMessages.length - 1];
    return last.content;
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center">
          <Users className="w-5 h-5 mr-2 text-green-600" />
          <h2 className="font-semibold text-gray-800">Groups</h2>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="p-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition"
          title="Create new group"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Group List */}
      <div className="flex-1 overflow-y-auto">
        {sortedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
            <Users className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-center">No groups yet</p>
            <p className="text-sm text-center">
              Create a group to start messaging
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 flex items-center text-green-600 hover:text-green-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Group
            </button>
          </div>
        ) : (
          sortedGroups.map((group) => {
            const unreadCount = getUnreadCount(group.id);
            const lastMessage = getLastMessage(group.id);
            const isSelected = selectedGroupId === group.id;

            return (
              <button
                key={group.id}
                onClick={() => onSelectGroup(group)}
                className={`w-full p-4 flex items-center hover:bg-gray-50 transition border-b ${
                  isSelected ? 'bg-green-50' : ''
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-medium ${
                    isSelected ? 'bg-green-600' : 'bg-gray-400'
                  }`}
                >
                  <Users className="w-6 h-6" />
                </div>

                {/* Content */}
                <div className="flex-1 ml-3 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 truncate">
                      {group.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(group.lastMessageAt ?? group.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-sm text-gray-500 truncate max-w-[200px]">
                      {lastMessage}
                    </p>
                    {unreadCount > 0 && (
                      <span className="ml-2 bg-green-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <CreateGroupModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(groupId) => {
            const newGroup = groups.find((g) => g.id === groupId);
            if (newGroup) {
              onSelectGroup(newGroup);
            }
          }}
        />
      )}
    </div>
  );
}
