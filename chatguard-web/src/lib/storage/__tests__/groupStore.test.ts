import { describe, test, expect, beforeEach } from 'vitest';
import { useGroupStore, type Group, type GroupMember, type GroupMessage, type GroupKey } from '../groupStore';

describe('GroupStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useGroupStore.setState({
      groups: [],
      members: {},
      messages: {},
      keys: [],
      selectedGroupId: null,
    });
  });

  describe('Group CRUD', () => {
    test('addGroup adds a group', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test Group',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      const groups = useGroupStore.getState().groups;
      expect(groups.length).toBe(1);
      expect(groups[0]).toEqual(group);
    });

    test('updateGroup updates group properties', () => {
      const group: Group = {
        id: 'g1',
        name: 'Old Name',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);
      useGroupStore.getState().updateGroup('g1', { name: 'New Name' });

      const updated = useGroupStore.getState().groups[0];
      expect(updated.name).toBe('New Name');
    });

    test('removeGroup removes group and related data', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);
      useGroupStore.getState().addKey({
        id: 'k1',
        groupId: 'g1',
        encryptedKey: [1, 2, 3],
        createdAt: Date.now(),
        rotationNumber: 0,
      });

      expect(useGroupStore.getState().groups.length).toBe(1);
      expect(useGroupStore.getState().keys.length).toBe(1);

      useGroupStore.getState().removeGroup('g1');

      expect(useGroupStore.getState().groups.length).toBe(0);
      expect(useGroupStore.getState().keys.length).toBe(0);
    });

    test('selectGroup sets selectedGroupId', () => {
      useGroupStore.getState().selectGroup('g1');
      expect(useGroupStore.getState().selectedGroupId).toBe('g1');

      useGroupStore.getState().selectGroup(null);
      expect(useGroupStore.getState().selectedGroupId).toBeNull();
    });
  });

  describe('Member Management', () => {
    test('setMembers sets all members for a group', () => {
      const members: GroupMember[] = [
        { groupId: 'g1', contactId: '', displayName: 'You', role: 'admin', joinedAt: 0, addedBy: '' },
        { groupId: 'g1', contactId: 'c1', displayName: 'Alice', role: 'member', joinedAt: 0, addedBy: '' },
      ];

      useGroupStore.getState().setMembers('g1', members);

      expect(useGroupStore.getState().members['g1']).toEqual(members);
    });

    test('addMember adds a single member', () => {
      const member: GroupMember = {
        groupId: 'g1',
        contactId: 'c1',
        displayName: 'Alice',
        role: 'member',
        joinedAt: Date.now(),
        addedBy: '',
      };

      useGroupStore.getState().setMembers('g1', []);
      useGroupStore.getState().addMember(member);

      expect(useGroupStore.getState().members['g1'].length).toBe(1);
      expect(useGroupStore.getState().members['g1'][0]).toEqual(member);
    });

    test('addMember prevents duplicates', () => {
      const member: GroupMember = {
        groupId: 'g1',
        contactId: 'c1',
        displayName: 'Alice',
        role: 'member',
        joinedAt: Date.now(),
        addedBy: '',
      };

      useGroupStore.getState().setMembers('g1', [member]);
      useGroupStore.getState().addMember(member);

      expect(useGroupStore.getState().members['g1'].length).toBe(1);
    });

    test('removeMember removes member from group', () => {
      const members: GroupMember[] = [
        { groupId: 'g1', contactId: '', displayName: 'You', role: 'admin', joinedAt: 0, addedBy: '' },
        { groupId: 'g1', contactId: 'c1', displayName: 'Alice', role: 'member', joinedAt: 0, addedBy: '' },
      ];

      useGroupStore.getState().setMembers('g1', members);
      useGroupStore.getState().removeMember('g1', 'c1');

      expect(useGroupStore.getState().members['g1'].length).toBe(1);
      expect(useGroupStore.getState().members['g1'][0].contactId).toBe('');
    });

    test('updateMemberRole changes role', () => {
      const member: GroupMember = {
        groupId: 'g1',
        contactId: 'c1',
        displayName: 'Alice',
        role: 'member',
        joinedAt: Date.now(),
        addedBy: '',
      };

      useGroupStore.getState().setMembers('g1', [member]);
      useGroupStore.getState().updateMemberRole('g1', 'c1', 'admin');

      expect(useGroupStore.getState().members['g1'][0].role).toBe('admin');
    });
  });

  describe('Message Management', () => {
    test('addGroupMessage adds message', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      const message: GroupMessage = {
        id: 'm1',
        contactId: '',
        groupId: 'g1',
        content: 'Hello!',
        isOutgoing: true,
        timestamp: Date.now(),
        status: 'sent',
      };

      useGroupStore.getState().addGroupMessage(message);

      expect(useGroupStore.getState().messages['g1'].length).toBe(1);
      expect(useGroupStore.getState().messages['g1'][0]).toEqual(message);
    });

    test('addGroupMessage updates lastMessageAt', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      const timestamp = Date.now();
      const message: GroupMessage = {
        id: 'm1',
        contactId: '',
        groupId: 'g1',
        content: 'Hello!',
        isOutgoing: true,
        timestamp,
        status: 'sent',
      };

      useGroupStore.getState().addGroupMessage(message);

      const updatedGroup = useGroupStore.getState().groups[0];
      expect(updatedGroup.lastMessageAt).toBe(timestamp);
    });

    test('addGroupMessage prevents duplicates', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      const message: GroupMessage = {
        id: 'm1',
        contactId: '',
        groupId: 'g1',
        content: 'Hello!',
        isOutgoing: true,
        timestamp: Date.now(),
        status: 'sent',
      };

      useGroupStore.getState().addGroupMessage(message);
      useGroupStore.getState().addGroupMessage(message);

      expect(useGroupStore.getState().messages['g1'].length).toBe(1);
    });

    test('addGroupMessage sorts by timestamp', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      const message2: GroupMessage = {
        id: 'm2',
        contactId: '',
        groupId: 'g1',
        content: 'Second',
        isOutgoing: true,
        timestamp: 2000,
        status: 'sent',
      };

      const message1: GroupMessage = {
        id: 'm1',
        contactId: '',
        groupId: 'g1',
        content: 'First',
        isOutgoing: true,
        timestamp: 1000,
        status: 'sent',
      };

      // Add in reverse order
      useGroupStore.getState().addGroupMessage(message2);
      useGroupStore.getState().addGroupMessage(message1);

      const messages = useGroupStore.getState().messages['g1'];
      expect(messages[0].id).toBe('m1');
      expect(messages[1].id).toBe('m2');
    });

    test('updateGroupMessageStatus updates status', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      const message: GroupMessage = {
        id: 'm1',
        contactId: '',
        groupId: 'g1',
        content: 'Hello!',
        isOutgoing: true,
        timestamp: Date.now(),
        status: 'sent',
      };

      useGroupStore.getState().addGroupMessage(message);
      useGroupStore.getState().updateGroupMessageStatus('m1', 'delivered');

      expect(useGroupStore.getState().messages['g1'][0].status).toBe('delivered');
    });

    test('getGroupMessages returns correct messages', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      const message: GroupMessage = {
        id: 'm1',
        contactId: '',
        groupId: 'g1',
        content: 'Hello!',
        isOutgoing: true,
        timestamp: Date.now(),
        status: 'sent',
      };

      useGroupStore.getState().addGroupMessage(message);

      const messages = useGroupStore.getState().getGroupMessages('g1');
      expect(messages.length).toBe(1);

      const emptyMessages = useGroupStore.getState().getGroupMessages('nonexistent');
      expect(emptyMessages.length).toBe(0);
    });

    test('getUnreadGroupCount counts unread incoming messages', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k1',
        keyRotationCount: 0,
      };

      useGroupStore.getState().addGroup(group);

      // Outgoing message (shouldn't count)
      useGroupStore.getState().addGroupMessage({
        id: 'm1',
        contactId: '',
        groupId: 'g1',
        content: 'Sent',
        isOutgoing: true,
        timestamp: Date.now(),
        status: 'sent',
      });

      // Unread incoming message
      useGroupStore.getState().addGroupMessage({
        id: 'm2',
        contactId: '',
        groupId: 'g1',
        senderContactId: 'c1',
        content: 'Received',
        isOutgoing: false,
        timestamp: Date.now(),
        status: 'delivered',
      });

      // Read incoming message
      useGroupStore.getState().addGroupMessage({
        id: 'm3',
        contactId: '',
        groupId: 'g1',
        senderContactId: 'c1',
        content: 'Read',
        isOutgoing: false,
        timestamp: Date.now(),
        status: 'read',
      });

      expect(useGroupStore.getState().getUnreadGroupCount('g1')).toBe(1);
    });
  });

  describe('Key Management', () => {
    test('addKey adds a key', () => {
      const key: GroupKey = {
        id: 'k1',
        groupId: 'g1',
        encryptedKey: [1, 2, 3],
        createdAt: Date.now(),
        rotationNumber: 0,
      };

      useGroupStore.getState().addKey(key);

      expect(useGroupStore.getState().keys.length).toBe(1);
    });

    test('getKey returns correct key', () => {
      const key: GroupKey = {
        id: 'k1',
        groupId: 'g1',
        encryptedKey: [1, 2, 3],
        createdAt: Date.now(),
        rotationNumber: 0,
      };

      useGroupStore.getState().addKey(key);

      expect(useGroupStore.getState().getKey('k1')).toEqual(key);
      expect(useGroupStore.getState().getKey('nonexistent')).toBeUndefined();
    });

    test('getCurrentKey returns key for current group key', () => {
      const group: Group = {
        id: 'g1',
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'k2',
        keyRotationCount: 1,
      };

      const key1: GroupKey = {
        id: 'k1',
        groupId: 'g1',
        encryptedKey: [1, 2, 3],
        createdAt: Date.now() - 1000,
        rotationNumber: 0,
      };

      const key2: GroupKey = {
        id: 'k2',
        groupId: 'g1',
        encryptedKey: [4, 5, 6],
        createdAt: Date.now(),
        rotationNumber: 1,
      };

      useGroupStore.getState().addGroup(group);
      useGroupStore.getState().addKey(key1);
      useGroupStore.getState().addKey(key2);

      const currentKey = useGroupStore.getState().getCurrentKey('g1');
      expect(currentKey?.id).toBe('k2');
    });

    test('deleteOldKeys removes keys below rotation threshold', () => {
      useGroupStore.setState({
        groups: [],
        members: {},
        messages: {},
        keys: [
          { id: 'k0', groupId: 'g1', encryptedKey: [], createdAt: 0, rotationNumber: 0 },
          { id: 'k1', groupId: 'g1', encryptedKey: [], createdAt: 0, rotationNumber: 1 },
          { id: 'k2', groupId: 'g1', encryptedKey: [], createdAt: 0, rotationNumber: 2 },
          { id: 'k3', groupId: 'g1', encryptedKey: [], createdAt: 0, rotationNumber: 3 },
          // Key from different group - should not be affected
          { id: 'other', groupId: 'g2', encryptedKey: [], createdAt: 0, rotationNumber: 0 },
        ],
        selectedGroupId: null,
      });

      // Delete keys with rotationNumber < 2
      useGroupStore.getState().deleteOldKeys('g1', 2);

      const keys = useGroupStore.getState().keys;
      expect(keys.length).toBe(3); // k2, k3, other
      expect(keys.map((k) => k.id)).toEqual(['k2', 'k3', 'other']);
    });
  });
});
