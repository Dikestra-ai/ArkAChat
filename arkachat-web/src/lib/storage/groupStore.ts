import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message, MessageStatus } from './chatStore';

export type MemberRole = 'admin' | 'member';

export interface Group {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;        // Contact ID of creator (empty string if self)
  avatarUrl?: string;
  currentKeyId: string;     // Current group key identifier
  keyRotationCount: number;
  lastMessageAt?: number;
}

export interface GroupMember {
  groupId: string;
  contactId: string;        // Empty string for self
  displayName: string;      // Cached display name
  role: MemberRole;
  joinedAt: number;
  addedBy: string;          // Contact ID who added this member
}

export interface GroupKey {
  id: string;
  groupId: string;
  encryptedKey: number[];   // Key encrypted with device master key (as array for JSON)
  createdAt: number;
  rotationNumber: number;
}

export type GroupMessageType =
  | 'TEXT'
  | 'FILE'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'KEY_ROTATION'
  | 'GROUP_INFO_UPDATE'
  | 'ADMIN_CHANGE'
  | 'DELIVERY_RECEIPT'
  | 'READ_RECEIPT';

export interface GroupMessageEnvelope {
  type: GroupMessageType;
  groupId: string;
  senderId: string;         // Contact ID of sender
  messageId: string;
  timestamp: number;
  keyId: string;            // Which group key version
  content?: string;
  fileId?: string;
  replyToId?: string;
  metadata?: Record<string, string>;
}

// Group-specific message type (extends base Message)
export interface GroupMessage extends Message {
  groupId: string;
  senderContactId?: string; // null = self
}

interface GroupState {
  groups: Group[];
  members: Record<string, GroupMember[]>;    // groupId -> members
  messages: Record<string, GroupMessage[]>;  // groupId -> messages
  keys: GroupKey[];
  selectedGroupId: string | null;

  // Actions
  selectGroup: (groupId: string | null) => void;
  addGroup: (group: Group) => void;
  updateGroup: (groupId: string, updates: Partial<Group>) => void;
  removeGroup: (groupId: string) => void;

  // Member actions
  setMembers: (groupId: string, members: GroupMember[]) => void;
  addMember: (member: GroupMember) => void;
  removeMember: (groupId: string, contactId: string) => void;
  updateMemberRole: (groupId: string, contactId: string, role: MemberRole) => void;

  // Message actions
  addGroupMessage: (message: GroupMessage) => void;
  updateGroupMessageStatus: (messageId: string, status: MessageStatus) => void;
  getGroupMessages: (groupId: string) => GroupMessage[];
  getUnreadGroupCount: (groupId: string) => number;

  // Key actions
  addKey: (key: GroupKey) => void;
  getKey: (keyId: string) => GroupKey | undefined;
  getCurrentKey: (groupId: string) => GroupKey | undefined;
  deleteOldKeys: (groupId: string, keepAfter: number) => void;
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set, get) => ({
      groups: [],
      members: {},
      messages: {},
      keys: [],
      selectedGroupId: null,

      selectGroup: (groupId) => {
        set({ selectedGroupId: groupId });
      },

      addGroup: (group) => {
        set((state) => ({
          groups: [...state.groups, group],
          members: { ...state.members, [group.id]: [] },
          messages: { ...state.messages, [group.id]: [] },
        }));
      },

      updateGroup: (groupId, updates) => {
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId ? { ...g, ...updates } : g
          ),
        }));
      },

      removeGroup: (groupId) => {
        set((state) => {
          const { [groupId]: _members, ...remainingMembers } = state.members;
          const { [groupId]: _messages, ...remainingMessages } = state.messages;
          return {
            groups: state.groups.filter((g) => g.id !== groupId),
            members: remainingMembers,
            messages: remainingMessages,
            selectedGroupId:
              state.selectedGroupId === groupId ? null : state.selectedGroupId,
            keys: state.keys.filter((k) => k.groupId !== groupId),
          };
        });
      },

      setMembers: (groupId, members) => {
        set((state) => ({
          members: { ...state.members, [groupId]: members },
        }));
      },

      addMember: (member) => {
        set((state) => {
          const existing = state.members[member.groupId] || [];
          // Check for duplicate
          if (existing.some((m) => m.contactId === member.contactId)) {
            return state;
          }
          return {
            members: {
              ...state.members,
              [member.groupId]: [...existing, member],
            },
          };
        });
      },

      removeMember: (groupId, contactId) => {
        set((state) => ({
          members: {
            ...state.members,
            [groupId]: (state.members[groupId] || []).filter(
              (m) => m.contactId !== contactId
            ),
          },
        }));
      },

      updateMemberRole: (groupId, contactId, role) => {
        set((state) => ({
          members: {
            ...state.members,
            [groupId]: (state.members[groupId] || []).map((m) =>
              m.contactId === contactId ? { ...m, role } : m
            ),
          },
        }));
      },

      addGroupMessage: (message) => {
        set((state) => {
          const groupMessages = state.messages[message.groupId] || [];

          // Check for duplicate
          if (groupMessages.some((m) => m.id === message.id)) {
            return state;
          }

          const newMessages = {
            ...state.messages,
            [message.groupId]: [...groupMessages, message].sort(
              (a, b) => a.timestamp - b.timestamp
            ),
          };

          // Update group's lastMessageAt
          const groups = state.groups.map((g) =>
            g.id === message.groupId
              ? { ...g, lastMessageAt: message.timestamp }
              : g
          );

          return { messages: newMessages, groups };
        });
      },

      updateGroupMessageStatus: (messageId, status) => {
        set((state) => {
          const newMessages: Record<string, GroupMessage[]> = {};
          for (const [groupId, messages] of Object.entries(state.messages)) {
            newMessages[groupId] = messages.map((m) =>
              m.id === messageId ? { ...m, status } : m
            );
          }
          return { messages: newMessages };
        });
      },

      getGroupMessages: (groupId) => {
        return get().messages[groupId] || [];
      },

      getUnreadGroupCount: (groupId) => {
        const messages = get().messages[groupId] || [];
        return messages.filter((m) => !m.isOutgoing && m.status !== 'read').length;
      },

      addKey: (key) => {
        set((state) => ({
          keys: [...state.keys, key],
        }));
      },

      getKey: (keyId) => {
        return get().keys.find((k) => k.id === keyId);
      },

      getCurrentKey: (groupId) => {
        const group = get().groups.find((g) => g.id === groupId);
        if (!group) return undefined;
        return get().keys.find((k) => k.id === group.currentKeyId);
      },

      deleteOldKeys: (groupId, keepAfter) => {
        set((state) => ({
          keys: state.keys.filter(
            (k) => k.groupId !== groupId || k.rotationNumber >= keepAfter
          ),
        }));
      },
    }),
    {
      name: 'arkachat-groups',
      partialize: (state) => ({
        groups: state.groups,
        members: state.members,
        messages: state.messages,
        keys: state.keys,
      }),
    }
  )
);
