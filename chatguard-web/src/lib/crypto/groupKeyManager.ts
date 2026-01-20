import { Shield, shieldCrypto } from '../shield/crypto';
import { useGroupStore, type Group, type GroupKey } from '../storage/groupStore';

const KEY_SIZE = 32;
const MAX_OLD_KEYS_TO_KEEP = 10;

/**
 * Manages group encryption keys for secure group messaging.
 *
 * Group Key Protocol:
 * 1. Group creator generates a random 32-byte group key
 * 2. Group key is encrypted for each member using their pairwise Shield session
 * 3. Each member receives encrypted key via their pairwise SimpleX queue
 * 4. When a member is removed, a new group key is generated and distributed
 *    to remaining members (forward secrecy)
 * 5. Old keys are kept for decrypting historical messages
 */
export class GroupKeyManager {
  private masterKey: Uint8Array | null = null;

  /**
   * Generate a new random group key.
   */
  generateGroupKey(): Uint8Array {
    return Shield.randomBytes(KEY_SIZE);
  }

  /**
   * Generate a unique key ID.
   */
  generateKeyId(): string {
    return crypto.randomUUID();
  }

  /**
   * Create a new group with initial key.
   * Returns the group key ID and encrypted key for storage.
   */
  async createGroupKey(groupId: string): Promise<GroupKey> {
    const key = this.generateGroupKey();
    const keyId = this.generateKeyId();

    // Encrypt the key with device master key for local storage
    const encryptedKey = await this.encryptKeyForStorage(key);

    const groupKey: GroupKey = {
      id: keyId,
      groupId,
      encryptedKey: Array.from(encryptedKey),
      createdAt: Date.now(),
      rotationNumber: 0,
    };

    // Store in group store
    useGroupStore.getState().addKey(groupKey);

    return groupKey;
  }

  /**
   * Rotate the group key (called when a member is removed).
   * Returns the new GroupKey to distribute to remaining members.
   */
  async rotateKey(group: Group): Promise<GroupKey> {
    const newKey = this.generateGroupKey();
    const keyId = this.generateKeyId();
    const encryptedKey = await this.encryptKeyForStorage(newKey);

    const groupKey: GroupKey = {
      id: keyId,
      groupId: group.id,
      encryptedKey: Array.from(encryptedKey),
      createdAt: Date.now(),
      rotationNumber: group.keyRotationCount + 1,
    };

    // Store new key
    useGroupStore.getState().addKey(groupKey);

    // Clean up old keys (keep last N for decryption)
    const keepAfter = group.keyRotationCount + 1 - MAX_OLD_KEYS_TO_KEEP;
    if (keepAfter > 0) {
      useGroupStore.getState().deleteOldKeys(group.id, keepAfter);
    }

    return groupKey;
  }

  /**
   * Encrypt the group key for a specific member using their pairwise session.
   * The member will receive this via their individual SimpleX queue.
   */
  async encryptKeyForMember(
    groupKey: Uint8Array,
    contactId: string,
    isInitiator: boolean
  ): Promise<Uint8Array> {
    const base64Key = this.uint8ArrayToBase64(groupKey);
    return shieldCrypto.encryptMessage(contactId, isInitiator, base64Key);
  }

  /**
   * Decrypt a group key received from another member.
   */
  async decryptKeyFromMember(
    encryptedKey: Uint8Array,
    contactId: string,
    isInitiator: boolean
  ): Promise<Uint8Array> {
    const base64Key = await shieldCrypto.decryptMessage(contactId, isInitiator, encryptedKey);
    return this.base64ToUint8Array(base64Key);
  }

  /**
   * Encrypt a message using the group's current key.
   */
  async encryptGroupMessage(groupId: string, plaintext: Uint8Array): Promise<Uint8Array> {
    const key = await this.getDecryptedCurrentKey(groupId);
    if (!key) {
      throw new Error(`No group key found for group: ${groupId}`);
    }
    return Shield.quickEncrypt(key, plaintext);
  }

  /**
   * Decrypt a message using the specified group key.
   */
  async decryptGroupMessage(
    groupId: string,
    keyId: string,
    ciphertext: Uint8Array
  ): Promise<Uint8Array> {
    const groupKey = useGroupStore.getState().getKey(keyId);
    if (!groupKey) {
      throw new Error(`Group key not found: ${keyId}`);
    }

    const key = await this.decryptKeyFromStorage(new Uint8Array(groupKey.encryptedKey));
    return Shield.quickDecrypt(key, ciphertext);
  }

  /**
   * Get the current decrypted group key for a group.
   */
  async getDecryptedCurrentKey(groupId: string): Promise<Uint8Array | null> {
    const groupKey = useGroupStore.getState().getCurrentKey(groupId);
    if (!groupKey) return null;
    return this.decryptKeyFromStorage(new Uint8Array(groupKey.encryptedKey));
  }

  /**
   * Store a received group key (from group creator or during key rotation).
   */
  async storeReceivedKey(
    groupId: string,
    keyId: string,
    keyBytes: Uint8Array,
    rotationNumber: number
  ): Promise<void> {
    const encryptedKey = await this.encryptKeyForStorage(keyBytes);

    const groupKey: GroupKey = {
      id: keyId,
      groupId,
      encryptedKey: Array.from(encryptedKey),
      createdAt: Date.now(),
      rotationNumber,
    };

    useGroupStore.getState().addKey(groupKey);
  }

  /**
   * Check if we have a key for a group.
   */
  hasKeyForGroup(groupId: string): boolean {
    return useGroupStore.getState().getCurrentKey(groupId) !== undefined;
  }

  /**
   * Encrypt key for local storage using device master key.
   */
  private async encryptKeyForStorage(key: Uint8Array): Promise<Uint8Array> {
    const masterKey = await this.getMasterKeyBytes();
    return Shield.quickEncrypt(masterKey, key);
  }

  /**
   * Decrypt key from local storage using device master key.
   */
  private async decryptKeyFromStorage(encryptedKey: Uint8Array): Promise<Uint8Array> {
    const masterKey = await this.getMasterKeyBytes();
    return Shield.quickDecrypt(masterKey, encryptedKey);
  }

  /**
   * Get master key bytes for key encryption.
   * Creates one if it doesn't exist.
   */
  private async getMasterKeyBytes(): Promise<Uint8Array> {
    if (this.masterKey) return this.masterKey;

    // Try to load from IndexedDB
    const stored = await this.loadMasterKey();
    if (stored) {
      this.masterKey = stored;
      return stored;
    }

    // Generate new master key
    const newKey = Shield.randomBytes(KEY_SIZE);
    await this.saveMasterKey(newKey);
    this.masterKey = newKey;
    return newKey;
  }

  private async loadMasterKey(): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open('chatguard-group-keys', 1);

      request.onerror = () => resolve(null);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['master'], 'readonly');
        const store = transaction.objectStore('master');
        const getRequest = store.get('group_master_key');

        getRequest.onsuccess = () => {
          if (getRequest.result) {
            resolve(new Uint8Array(getRequest.result.key));
          } else {
            resolve(null);
          }
        };

        getRequest.onerror = () => resolve(null);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('master')) {
          db.createObjectStore('master', { keyPath: 'id' });
        }
      };
    });
  }

  private async saveMasterKey(key: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('chatguard-group-keys', 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['master'], 'readwrite');
        const store = transaction.objectStore('master');
        store.put({ id: 'group_master_key', key: Array.from(key) });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('master')) {
          db.createObjectStore('master', { keyPath: 'id' });
        }
      };
    });
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...Array.from(bytes)));
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

// Singleton instance
export const groupKeyManager = new GroupKeyManager();
