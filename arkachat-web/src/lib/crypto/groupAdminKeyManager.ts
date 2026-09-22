/**
 * Group admin signing key management — WebCrypto ECDSA P-256.
 *
 * Spec: docs/GROUP_CONTROL_SIGNING_SPEC.md
 *
 * Only the group admin possesses the private key. All members store the admin's
 * public key (from Group.adminPublicKey) and verify every control message before
 * applying it locally.
 *
 * Wire format for signatures: 64-byte raw (r || s), big-endian, zero-padded to 32 each.
 * WebCrypto ECDSA produces this format natively.
 */

const SIGNING_ALG: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };

// TypeScript strict-mode helper: extract a plain ArrayBuffer from a Uint8Array
// so WebCrypto's BufferSource overloads accept the argument.
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
const SIGN_PARAMS: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
const IDB_DB_NAME = 'arkachat-admin-keys';
const IDB_STORE = 'keys';

// Domain-separation prefix — must match GroupAdminKeyManager.kt DOMAIN_SEP
export const DOMAIN_SEP = 'arkachat:control:v1:';

// Control message types that require admin signature — must match Kotlin set
export const ADMIN_CONTROLLED_TYPES = new Set([
  'MEMBER_ADDED', 'MEMBER_REMOVED', 'KEY_ROTATION',
  'GROUP_INFO_UPDATE', 'ADMIN_CHANGE',
]);

export class GroupAdminKeyManager {
  private memCache = new Map<string, CryptoKeyPair>();

  /**
   * Generate a new admin signing keypair for [groupId].
   * Private key is stored in IndexedDB (non-extractable).
   * Returns X.509 SPKI bytes of the public key for distribution.
   */
  async generateAdminKey(groupId: string): Promise<Uint8Array> {
    const keyPair = await crypto.subtle.generateKey(
      SIGNING_ALG, false /* non-extractable */, ['sign', 'verify']
    );
    // Export public key to SPKI for distribution — private key stays non-extractable
    const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    await this.storeKeyPair(groupId, keyPair);
    this.memCache.set(groupId, keyPair);
    return new Uint8Array(publicKeySpki);
  }

  /**
   * Return the X.509 SPKI bytes of this device's admin public key,
   * or null if this device is not the admin for [groupId].
   */
  async getPublicKey(groupId: string): Promise<Uint8Array | null> {
    const keyPair = await this.loadKeyPair(groupId);
    if (!keyPair) return null;
    const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    return new Uint8Array(spki);
  }

  /** True if this browser holds the admin private key for [groupId]. */
  async isAdmin(groupId: string): Promise<boolean> {
    return (await this.loadKeyPair(groupId)) !== null;
  }

  /** Delete admin key when this device is demoted from admin. */
  async deleteAdminKey(groupId: string): Promise<void> {
    this.memCache.delete(groupId);
    await this.deleteFromIdb(groupId);
  }

  /**
   * Sign a control message. Returns 64-byte raw (r || s) signature.
   *
   * @param groupId    group UUID
   * @param type       GroupMessageType name, e.g. 'MEMBER_ADDED'
   * @param senderId   sender contact ID
   * @param timestamp  Unix milliseconds
   * @param payloadJson JSON-encoded additional payload, or '' if none
   */
  async signControlMessage(
    groupId: string,
    type: string,
    senderId: string,
    timestamp: number,
    payloadJson = ''
  ): Promise<Uint8Array> {
    if (!ADMIN_CONTROLLED_TYPES.has(type)) {
      throw new Error(`Type ${type} is not an admin-controlled message`);
    }
    const keyPair = await this.loadKeyPair(groupId);
    if (!keyPair) throw new Error(`No admin key for group: ${groupId}`);
    const message = await buildSigningInput(type, groupId, senderId, timestamp, payloadJson);
    const sig = await crypto.subtle.sign(SIGN_PARAMS, keyPair.privateKey, toArrayBuffer(message));
    return new Uint8Array(sig); // 64 bytes (r || s) native WebCrypto format
  }

  /**
   * Verify a control message signature.
   *
   * @param adminPublicKeyBytes X.509 SPKI bytes of the group admin's public key
   * @param rawSignature        64-byte raw (r || s) signature
   */
  async verifyControlMessage(
    adminPublicKeyBytes: Uint8Array,
    type: string,
    groupId: string,
    senderId: string,
    timestamp: number,
    payloadJson = '',
    rawSignature: Uint8Array
  ): Promise<boolean> {
    if (rawSignature.byteLength !== 64) return false;
    try {
      const publicKey = await crypto.subtle.importKey(
        'spki', toArrayBuffer(adminPublicKeyBytes), SIGNING_ALG, false, ['verify']
      );
      const message = await buildSigningInput(type, groupId, senderId, timestamp, payloadJson);
      return await crypto.subtle.verify(SIGN_PARAMS, publicKey, toArrayBuffer(rawSignature), toArrayBuffer(message));
    } catch {
      return false;
    }
  }

  // ---- IndexedDB persistence ----

  protected async storeKeyPair(groupId: string, keyPair: CryptoKeyPair): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({ id: groupId, keyPair });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  protected async loadFromIdb(groupId: string): Promise<CryptoKeyPair | null> {
    return new Promise((resolve) => {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const get = tx.objectStore(IDB_STORE).get(groupId);
        get.onsuccess = () => resolve(get.result?.keyPair ?? null);
        get.onerror = () => resolve(null);
      };
    });
  }

  protected async deleteFromIdb(groupId: string): Promise<void> {
    return new Promise((resolve) => {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onerror = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(groupId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
    });
  }

  private async loadKeyPair(groupId: string): Promise<CryptoKeyPair | null> {
    const cached = this.memCache.get(groupId);
    if (cached) return cached;
    const loaded = await this.loadFromIdb(groupId);
    if (loaded) this.memCache.set(groupId, loaded);
    return loaded;
  }
}

/**
 * Canonical signing input — identical on Android and Web.
 *
 * "arkachat:control:v1:{type}:{groupId}:{senderId}:{timestamp}:{sha256hex(payloadJson)}"
 *
 * sha256hex('') = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
 */
export async function buildSigningInput(
  type: string,
  groupId: string,
  senderId: string,
  timestamp: number,
  payloadJson: string
): Promise<Uint8Array> {
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', payloadBytes);
  const payloadHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const input = `${DOMAIN_SEP}${type}:${groupId}:${senderId}:${timestamp}:${payloadHash}`;
  return new TextEncoder().encode(input);
}

// Singleton export
export const groupAdminKeyManager = new GroupAdminKeyManager();
