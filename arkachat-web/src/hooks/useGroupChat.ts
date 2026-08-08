import { useEffect, useCallback } from 'react';
import { useGroupStore, Group, GroupMember, GroupMessage } from '@/lib/storage/groupStore';
import { useChatStore, Contact } from '@/lib/storage/chatStore';
import { getBridgeInstance } from '@/components/BridgeProvider';

/**
 * Hook to access group chat functionality.
 *
 * Provides:
 * - Access to groups, members, and messages from the store
 * - Methods to create groups, send messages, manage members
 * - Admin permission checks and actions
 */
export function useGroupChatBridge() {
  const groups = useGroupStore((state) => state.groups);
  const members = useGroupStore((state) => state.members);
  const messages = useGroupStore((state) => state.messages);
  const selectedGroupId = useGroupStore((state) => state.selectedGroupId);
  const selectGroup = useGroupStore((state) => state.selectGroup);
  const contacts = useChatStore((state) => state.contacts);
  const connectionState = useChatStore((state) => state.connectionState);

  /**
   * Create a new group with initial members.
   */
  const createGroup = useCallback(
    async (name: string, memberContactIds: string[]): Promise<Group | null> => {
      try {
        return await getBridgeInstance()?.createGroup(name, memberContactIds) ?? null;
      } catch (error) {
        console.error('Failed to create group:', error);
        return null;
      }
    },
    []
  );

  /**
   * Send a text message to a group.
   */
  const sendGroupMessage = useCallback(
    async (groupId: string, text: string): Promise<GroupMessage | null> => {
      try {
        return await getBridgeInstance()?.sendGroupMessage(groupId, text) ?? null;
      } catch (error) {
        console.error('Failed to send group message:', error);
        return null;
      }
    },
    []
  );

  /**
   * Add a member to a group.
   * Requires admin permission.
   */
  const addMember = useCallback(
    async (groupId: string, contactId: string): Promise<GroupMember | null> => {
      try {
        return await getBridgeInstance()?.addGroupMember(groupId, contactId) ?? null;
      } catch (error) {
        console.error('Failed to add member:', error);
        return null;
      }
    },
    []
  );

  /**
   * Remove a member from a group.
   * Requires admin permission.
   */
  const removeMember = useCallback(
    async (groupId: string, contactId: string): Promise<boolean> => {
      try {
        await getBridgeInstance()?.removeGroupMember(groupId, contactId);
        return true;
      } catch (error) {
        console.error('Failed to remove member:', error);
        return false;
      }
    },
    []
  );

  /**
   * Leave a group.
   */
  const leaveGroup = useCallback(async (groupId: string): Promise<boolean> => {
    try {
      await getBridgeInstance()?.leaveGroup(groupId);
      return true;
    } catch (error) {
      console.error('Failed to leave group:', error);
      return false;
    }
  }, []);

  /**
   * Update group name.
   * Requires admin permission.
   */
  const updateGroupName = useCallback(
    async (groupId: string, newName: string): Promise<boolean> => {
      try {
        await getBridgeInstance()?.updateGroupName(groupId, newName);
        return true;
      } catch (error) {
        console.error('Failed to update group name:', error);
        return false;
      }
    },
    []
  );

  /**
   * Promote a member to admin.
   * Requires admin permission.
   */
  const promoteToAdmin = useCallback(
    async (groupId: string, contactId: string): Promise<boolean> => {
      try {
        await getBridgeInstance()?.promoteToAdmin(groupId, contactId);
        return true;
      } catch (error) {
        console.error('Failed to promote member:', error);
        return false;
      }
    },
    []
  );

  /**
   * Demote an admin to member.
   * Requires admin permission.
   */
  const demoteToMember = useCallback(
    async (groupId: string, contactId: string): Promise<boolean> => {
      try {
        await getBridgeInstance()?.demoteToMember(groupId, contactId);
        return true;
      } catch (error) {
        console.error('Failed to demote member:', error);
        return false;
      }
    },
    []
  );

  /**
   * Check if current user is admin.
   */
  const isAdmin = useCallback((groupId: string): boolean => {
    return getBridgeInstance()?.isAdmin(groupId) ?? false;
  }, []);

  /**
   * Get group members by group ID.
   */
  const getGroupMembers = useCallback(
    (groupId: string): GroupMember[] => {
      return members[groupId] || [];
    },
    [members]
  );

  /**
   * Get group messages by group ID.
   */
  const getGroupMessages = useCallback(
    (groupId: string): GroupMessage[] => {
      return messages[groupId] || [];
    },
    [messages]
  );

  /**
   * Get a group by ID.
   */
  const getGroup = useCallback(
    (groupId: string): Group | undefined => {
      return groups.find((g) => g.id === groupId);
    },
    [groups]
  );

  /**
   * Get contact info for a member.
   */
  const getContactForMember = useCallback(
    (contactId: string): Contact | undefined => {
      if (contactId === '') return undefined; // Self
      return contacts.find((c) => c.id === contactId);
    },
    [contacts]
  );

  return {
    // State
    groups,
    members,
    messages,
    contacts,
    selectedGroupId,
    connectionState,

    // Actions
    selectGroup,
    createGroup,
    sendGroupMessage,
    addMember,
    removeMember,
    leaveGroup,
    updateGroupName,
    promoteToAdmin,
    demoteToMember,
    isAdmin,
    getGroupMembers,
    getGroupMessages,
    getGroup,
    getContactForMember,
  };
}

/**
 * Hook for a single group chat conversation.
 */
export function useGroupChat(groupId: string) {
  const {
    getGroup,
    getGroupMembers,
    getGroupMessages,
    sendGroupMessage: sendBridgeMessage,
    addMember,
    removeMember,
    leaveGroup,
    updateGroupName,
    promoteToAdmin,
    demoteToMember,
    isAdmin,
    getContactForMember,
    connectionState,
  } = useGroupChatBridge();

  const group = getGroup(groupId);
  const members = getGroupMembers(groupId);
  const messages = getGroupMessages(groupId);
  const admin = isAdmin(groupId);

  // Select this group on mount
  useEffect(() => {
    useGroupStore.getState().selectGroup(groupId);
    return () => {
      useGroupStore.getState().selectGroup(null);
    };
  }, [groupId]);

  const sendMessage = useCallback(
    async (text: string) => {
      return sendBridgeMessage(groupId, text);
    },
    [groupId, sendBridgeMessage]
  );

  const addGroupMember = useCallback(
    async (contactId: string) => {
      return addMember(groupId, contactId);
    },
    [groupId, addMember]
  );

  const removeGroupMember = useCallback(
    async (contactId: string) => {
      return removeMember(groupId, contactId);
    },
    [groupId, removeMember]
  );

  const leave = useCallback(async () => {
    return leaveGroup(groupId);
  }, [groupId, leaveGroup]);

  const updateName = useCallback(
    async (newName: string) => {
      return updateGroupName(groupId, newName);
    },
    [groupId, updateGroupName]
  );

  const promote = useCallback(
    async (contactId: string) => {
      return promoteToAdmin(groupId, contactId);
    },
    [groupId, promoteToAdmin]
  );

  const demote = useCallback(
    async (contactId: string) => {
      return demoteToMember(groupId, contactId);
    },
    [groupId, demoteToMember]
  );

  return {
    group,
    members,
    messages,
    isAdmin: admin,
    connectionState,
    sendMessage,
    addMember: addGroupMember,
    removeMember: removeGroupMember,
    leave,
    updateName,
    promote,
    demote,
    getContactForMember,
  };
}
