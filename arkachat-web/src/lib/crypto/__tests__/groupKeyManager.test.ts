import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GroupKeyManager } from '../groupKeyManager';
import { useGroupStore, type Group, type GroupKey } from '../../storage/groupStore';

// Mock Shield
vi.mock('../../shield/crypto', () => ({
  Shield: {
    randomBytes: (size: number) => new Uint8Array(size).fill(0x42),
    quickEncrypt: (key: Uint8Array, data: Uint8Array) => new Uint8Array([...data, 0xee]),
    quickDecrypt: (key: Uint8Array, data: Uint8Array) => data.slice(0, -1),
  },
  shieldCrypto: {
    encryptMessage: vi.fn().mockResolvedValue(new Uint8Array([0x01, 0x02, 0x03])),
    decryptMessage: vi.fn().mockResolvedValue('dGVzdA=='), // base64 for 'test'
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7),
});

describe('GroupKeyManager', () => {
  let keyManager: GroupKeyManager;

  beforeEach(() => {
    keyManager = new GroupKeyManager();
    // Reset group store
    useGroupStore.setState({ groups: [], members: {}, messages: {}, keys: [] });
  });

  describe('generateGroupKey', () => {
    test('creates 32-byte key', () => {
      const key = keyManager.generateGroupKey();
      expect(key.length).toBe(32);
    });

    test('generates random bytes', () => {
      const key = keyManager.generateGroupKey();
      expect(key[0]).toBe(0x42); // Our mock fills with 0x42
    });
  });

  describe('generateKeyId', () => {
    test('creates unique ID', () => {
      const id1 = keyManager.generateKeyId();
      const id2 = keyManager.generateKeyId();
      expect(id1).not.toBe(id2);
    });

    test('ID is UUID format', () => {
      const id = keyManager.generateKeyId();
      expect(id).toContain('test-uuid-');
    });
  });

  describe('createGroupKey', () => {
    test('creates and stores group key', async () => {
      const groupId = 'test-group-1';
      const groupKey = await keyManager.createGroupKey(groupId);

      expect(groupKey.groupId).toBe(groupId);
      expect(groupKey.rotationNumber).toBe(0);
      expect(groupKey.encryptedKey.length).toBeGreaterThan(0);

      // Verify stored in group store
      const stored = useGroupStore.getState().keys;
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe(groupKey.id);
    });
  });

  describe('rotateKey', () => {
    test('generates new key with incremented rotation', async () => {
      const group: Group = {
        id: 'test-group-1',
        name: 'Test Group',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'old-key-id',
        keyRotationCount: 2,
      };

      const newKey = await keyManager.rotateKey(group);

      expect(newKey.rotationNumber).toBe(3); // 2 + 1
      expect(newKey.id).not.toBe('old-key-id');
    });

    test('stores new key in store', async () => {
      const group: Group = {
        id: 'test-group-1',
        name: 'Test Group',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: 'old-key-id',
        keyRotationCount: 0,
      };

      const newKey = await keyManager.rotateKey(group);

      const stored = useGroupStore.getState().keys;
      expect(stored.some((k) => k.id === newKey.id)).toBe(true);
    });
  });

  describe('encryptGroupMessage', () => {
    test('encrypts with current group key', async () => {
      const groupId = 'test-group-1';

      // First create a key for the group
      const groupKey = await keyManager.createGroupKey(groupId);

      // Create the group
      useGroupStore.getState().addGroup({
        id: groupId,
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: groupKey.id,
        keyRotationCount: 0,
      });

      const plaintext = new Uint8Array([0x01, 0x02, 0x03]);
      const encrypted = await keyManager.encryptGroupMessage(groupId, plaintext);

      // Our mock adds 0xee at the end
      expect(encrypted[encrypted.length - 1]).toBe(0xee);
    });

    test('throws error when no key exists', async () => {
      const groupId = 'nonexistent-group';

      await expect(
        keyManager.encryptGroupMessage(groupId, new Uint8Array([1]))
      ).rejects.toThrow();
    });
  });

  describe('decryptGroupMessage', () => {
    test('decrypts with specified key', async () => {
      const groupId = 'test-group-1';

      // Create and store a key
      const groupKey = await keyManager.createGroupKey(groupId);

      useGroupStore.getState().addGroup({
        id: groupId,
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: groupKey.id,
        keyRotationCount: 0,
      });

      // Mock ciphertext (plaintext + 0xee from mock)
      const ciphertext = new Uint8Array([0x01, 0x02, 0x03, 0xee]);

      const decrypted = await keyManager.decryptGroupMessage(groupId, groupKey.id, ciphertext);

      // Our mock removes the last byte
      expect(Array.from(decrypted)).toEqual([0x01, 0x02, 0x03]);
    });

    test('throws error for unknown key', async () => {
      await expect(
        keyManager.decryptGroupMessage('group-1', 'unknown-key', new Uint8Array([1]))
      ).rejects.toThrow();
    });
  });

  describe('storeReceivedKey', () => {
    test('stores key from another member', async () => {
      const groupId = 'test-group-1';
      const keyId = 'received-key-id';
      const keyBytes = new Uint8Array(32).fill(0x11);
      const rotationNumber = 5;

      await keyManager.storeReceivedKey(groupId, keyId, keyBytes, rotationNumber);

      const stored = useGroupStore.getState().keys;
      const key = stored.find((k) => k.id === keyId);
      expect(key).toBeDefined();
      expect(key?.rotationNumber).toBe(5);
      expect(key?.groupId).toBe(groupId);
    });
  });

  describe('hasKeyForGroup', () => {
    test('returns false when no key exists', () => {
      expect(keyManager.hasKeyForGroup('unknown-group')).toBe(false);
    });

    test('returns true when key exists', async () => {
      const groupId = 'test-group-1';
      const groupKey = await keyManager.createGroupKey(groupId);

      useGroupStore.getState().addGroup({
        id: groupId,
        name: 'Test',
        createdAt: Date.now(),
        createdBy: '',
        currentKeyId: groupKey.id,
        keyRotationCount: 0,
      });

      expect(keyManager.hasKeyForGroup(groupId)).toBe(true);
    });
  });
});

describe('GroupMessageEnvelope', () => {
  test('serialize and deserialize preserves all fields', () => {
    const envelope = {
      type: 'TEXT' as const,
      groupId: 'group-1',
      senderId: 'sender-1',
      messageId: 'msg-1',
      timestamp: 1705780000000,
      keyId: 'key-1',
      content: 'Hello group!',
    };

    const json = JSON.stringify(envelope);
    const restored = JSON.parse(json);

    expect(restored).toEqual(envelope);
  });

  test('MEMBER_ADDED includes member contact ID', () => {
    const envelope = {
      type: 'MEMBER_ADDED' as const,
      groupId: 'group-1',
      senderId: 'admin-1',
      messageId: 'msg-1',
      timestamp: Date.now(),
      keyId: 'key-1',
      metadata: { memberId: 'new-member-1' },
    };

    const json = JSON.stringify(envelope);
    expect(json).toContain('new-member-1');
  });

  test('KEY_ROTATION includes new key ID', () => {
    const envelope = {
      type: 'KEY_ROTATION' as const,
      groupId: 'group-1',
      senderId: 'admin-1',
      messageId: 'msg-1',
      timestamp: Date.now(),
      keyId: 'new-key-123',
      metadata: { oldKeyId: 'old-key-456' },
    };

    const json = JSON.stringify(envelope);
    expect(json).toContain('new-key-123');
    expect(json).toContain('old-key-456');
  });
});

describe('Group Permission Tests', () => {
  test('admin role check returns correct value', () => {
    const members = [
      { groupId: 'g1', contactId: '', role: 'admin' as const, displayName: 'You', joinedAt: 0, addedBy: '' },
      { groupId: 'g1', contactId: 'c1', role: 'member' as const, displayName: 'Alice', joinedAt: 0, addedBy: '' },
    ];

    useGroupStore.setState({ members: { g1: members }, groups: [], messages: {}, keys: [] });

    const selfMember = useGroupStore.getState().members['g1']?.find((m) => m.contactId === '');
    expect(selfMember?.role).toBe('admin');
  });

  test('non-admin role check returns correct value', () => {
    const members = [
      { groupId: 'g1', contactId: '', role: 'member' as const, displayName: 'You', joinedAt: 0, addedBy: 'admin' },
      { groupId: 'g1', contactId: 'admin', role: 'admin' as const, displayName: 'Admin', joinedAt: 0, addedBy: '' },
    ];

    useGroupStore.setState({ members: { g1: members }, groups: [], messages: {}, keys: [] });

    const selfMember = useGroupStore.getState().members['g1']?.find((m) => m.contactId === '');
    expect(selfMember?.role).toBe('member');
  });
});
