/**
 * Shield Browser Implementation
 *
 * Browser-compatible implementation of Shield encryption using Web Crypto API.
 * Maintains API compatibility with @guard8/shield for cross-platform consistency.
 */

/**
 * Generate keystream using SHA256 (matches Shield ratchet.js)
 */
async function generateKeystream(key: Uint8Array, nonce: Uint8Array, length: number): Promise<Uint8Array> {
  const keystream = new Uint8Array(Math.ceil(length / 32) * 32);

  for (let i = 0; i < Math.ceil(length / 32); i++) {
    const counter = new Uint8Array(4);
    new DataView(counter.buffer).setUint32(0, i, true);

    const data = new Uint8Array(key.length + nonce.length + 4);
    data.set(key, 0);
    data.set(nonce, key.length);
    data.set(counter, key.length + nonce.length);

    const block = await crypto.subtle.digest('SHA-256', data as BufferSource);
    keystream.set(new Uint8Array(block), i * 32);
  }

  return keystream.slice(0, length);
}

/**
 * HMAC-SHA256 using Web Crypto API
 */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  return new Uint8Array(signature);
}

/**
 * SHA256 hash using Web Crypto API
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(hash);
}

/**
 * Timing-safe comparison
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Concatenate Uint8Arrays
 */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Ratcheting session for forward secrecy.
 * Browser-compatible implementation matching Shield's RatchetSession.
 */
export class RatchetSession {
  private sendChain: Uint8Array;
  private recvChain: Uint8Array;
  private _sendCounter = 0;
  private _recvCounter = 0;

  private constructor(sendChain: Uint8Array, recvChain: Uint8Array) {
    this.sendChain = sendChain;
    this.recvChain = recvChain;
  }

  /**
   * Create a new ratchet session from shared root key.
   */
  static async create(rootKey: Uint8Array, isInitiator: boolean): Promise<RatchetSession> {
    const sendLabel = new TextEncoder().encode(isInitiator ? 'send' : 'recv');
    const recvLabel = new TextEncoder().encode(isInitiator ? 'recv' : 'send');

    const sendChain = await sha256(concat(rootKey, sendLabel));
    const recvChain = await sha256(concat(rootKey, recvLabel));

    return new RatchetSession(sendChain, recvChain);
  }

  /**
   * Restore a session from persisted state.
   */
  static fromState(state: SessionState): RatchetSession {
    const session = new RatchetSession(state.sendChain, state.recvChain);
    session._sendCounter = state.sendCounter;
    session._recvCounter = state.recvCounter;
    return session;
  }

  /**
   * Export session state for persistence.
   */
  toState(): SessionState {
    return {
      sendChain: new Uint8Array(this.sendChain),
      recvChain: new Uint8Array(this.recvChain),
      sendCounter: this._sendCounter,
      recvCounter: this._recvCounter,
    };
  }

  private async ratchetChain(chainKey: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
    const chainLabel = new TextEncoder().encode('chain');
    const msgLabel = new TextEncoder().encode('message');

    const newChain = await sha256(concat(chainKey, chainLabel));
    const msgKey = await sha256(concat(chainKey, msgLabel));

    return [newChain, msgKey];
  }

  /**
   * Encrypt a message with forward secrecy.
   */
  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    const [newChain, msgKey] = await this.ratchetChain(this.sendChain);
    this.sendChain = newChain;

    const counter = this._sendCounter;
    this._sendCounter++;

    return this.encryptWithKey(msgKey, plaintext, counter);
  }

  /**
   * Decrypt a message with forward secrecy.
   */
  async decrypt(ciphertext: Uint8Array): Promise<Uint8Array | null> {
    const [newChain, msgKey] = await this.ratchetChain(this.recvChain);
    this.recvChain = newChain;

    const result = await this.decryptWithKey(msgKey, ciphertext);
    if (result === null) {
      return null;
    }

    const [plaintext, counter] = result;

    // Verify counter (replay protection)
    if (counter !== this._recvCounter) {
      return null;
    }

    this._recvCounter++;
    return plaintext;
  }

  private async encryptWithKey(key: Uint8Array, plaintext: Uint8Array, counter: number): Promise<Uint8Array> {
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const counterBytes = new Uint8Array(8);
    new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), true);

    // Data: counter || plaintext
    const data = concat(counterBytes, plaintext);

    // Generate keystream
    const keystream = await generateKeystream(key, nonce, data.length);

    // XOR encrypt
    const ciphertext = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      ciphertext[i] = data[i] ^ keystream[i];
    }

    // HMAC authenticate
    const macData = concat(nonce, ciphertext);
    const fullMac = await hmacSha256(key, macData);
    const mac = fullMac.slice(0, 16);

    return concat(nonce, ciphertext, mac);
  }

  private async decryptWithKey(key: Uint8Array, encrypted: Uint8Array): Promise<[Uint8Array, number] | null> {
    if (encrypted.length < 40) { // 16 nonce + 8 counter + 16 mac
      return null;
    }

    const nonce = encrypted.slice(0, 16);
    const ciphertext = encrypted.slice(16, -16);
    const mac = encrypted.slice(-16);

    // Verify MAC
    const macData = concat(nonce, ciphertext);
    const fullExpectedMac = await hmacSha256(key, macData);
    const expectedMac = fullExpectedMac.slice(0, 16);

    if (!timingSafeEqual(mac, expectedMac)) {
      return null;
    }

    // Decrypt
    const keystream = await generateKeystream(key, nonce, ciphertext.length);
    const decrypted = new Uint8Array(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i++) {
      decrypted[i] = ciphertext[i] ^ keystream[i];
    }

    // Parse counter
    const counter = Number(new DataView(decrypted.buffer).getBigUint64(0, true));

    return [decrypted.slice(8), counter];
  }

  get sendCounter(): number {
    return this._sendCounter;
  }

  get recvCounter(): number {
    return this._recvCounter;
  }
}

/**
 * Session state for persistence.
 */
export interface SessionState {
  sendChain: Uint8Array;
  recvChain: Uint8Array;
  sendCounter: number;
  recvCounter: number;
}

/**
 * Key exchange via QR codes.
 * Browser-compatible implementation matching Shield's QRExchange.
 */
export class QRExchange {
  /**
   * Encode key for QR code (base64url).
   */
  static encode(key: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...Array.from(key)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Decode key from QR code (base64url).
   */
  static decode(encoded: string): Uint8Array {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padding);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Generate complete exchange data with metadata.
   */
  static generateExchangeData(key: Uint8Array, metadata?: Record<string, unknown>): string {
    const data: { v: number; k: string; m?: Record<string, unknown> } = {
      v: 1,
      k: QRExchange.encode(key),
    };
    if (metadata) data.m = metadata;
    return JSON.stringify(data);
  }

  /**
   * Parse exchange data.
   */
  static parseExchangeData(data: string): [Uint8Array, Record<string, unknown> | null] {
    const parsed = JSON.parse(data);
    const key = QRExchange.decode(parsed.k);
    return [key, parsed.m || null];
  }
}

/**
 * Shield utility functions.
 */
export const Shield = {
  KEY_SIZE: 32,

  /**
   * Generate random bytes.
   */
  randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  },

  /**
   * SHA256 hash.
   */
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    return sha256(data);
  },

  /**
   * HMAC-SHA256.
   */
  async hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    return hmacSha256(key, data);
  },

  /**
   * Quick encrypt with pre-shared key (AES-GCM).
   */
  async quickEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      cryptoKey,
      plaintext as BufferSource
    );
    return concat(nonce, new Uint8Array(ciphertext));
  },

  /**
   * Quick decrypt with pre-shared key (AES-GCM).
   */
  async quickDecrypt(key: Uint8Array, encrypted: Uint8Array): Promise<Uint8Array> {
    const nonce = encrypted.slice(0, 12);
    const ciphertext = encrypted.slice(12);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      cryptoKey,
      ciphertext as BufferSource
    );
    return new Uint8Array(plaintext);
  },
};

/**
 * Web Shield Crypto - High-level API for ChatGuard web client.
 */
export class WebShieldCrypto {
  private sessions = new Map<string, RatchetSession>();

  /**
   * Get or create a RatchetSession for a contact.
   */
  async getSession(contactId: string, isInitiator: boolean): Promise<RatchetSession> {
    const existing = this.sessions.get(contactId);
    if (existing) {
      return existing;
    }

    // Check for persisted session
    const persisted = await this.loadSession(contactId);
    if (persisted) {
      this.sessions.set(contactId, persisted);
      return persisted;
    }

    // Create new session
    const sharedKey = await this.getKey(`shared_key_${contactId}`);
    if (!sharedKey) {
      throw new Error(`No shared key found for contact: ${contactId}`);
    }

    const session = await RatchetSession.create(sharedKey, isInitiator);
    this.sessions.set(contactId, session);
    await this.saveSession(contactId, session);
    return session;
  }

  /**
   * Encrypt a message for a contact.
   */
  async encryptMessage(contactId: string, isInitiator: boolean, message: string): Promise<Uint8Array> {
    const session = await this.getSession(contactId, isInitiator);
    const plaintext = new TextEncoder().encode(message);
    const ciphertext = await session.encrypt(plaintext);
    await this.saveSession(contactId, session);
    return ciphertext;
  }

  /**
   * Decrypt a message from a contact.
   */
  async decryptMessage(contactId: string, isInitiator: boolean, ciphertext: Uint8Array): Promise<string> {
    const session = await this.getSession(contactId, isInitiator);
    const plaintext = await session.decrypt(ciphertext);
    if (!plaintext) {
      throw new Error('Decryption failed');
    }
    await this.saveSession(contactId, session);
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Generate a new shared key for a contact.
   */
  async generateSharedKey(contactId: string): Promise<Uint8Array> {
    const sharedKey = Shield.randomBytes(Shield.KEY_SIZE);
    const mediaKey = Shield.randomBytes(Shield.KEY_SIZE);

    await this.storeKey(`shared_key_${contactId}`, sharedKey);
    await this.storeKey(`media_key_${contactId}`, mediaKey);

    return sharedKey;
  }

  /**
   * Import a shared key from a contact (received via QR exchange).
   */
  async importSharedKey(contactId: string, sharedKey: Uint8Array): Promise<void> {
    if (sharedKey.length !== Shield.KEY_SIZE) {
      throw new Error('Invalid key size');
    }

    // Derive media key from shared key
    const mediaKeyData = concat(sharedKey, new TextEncoder().encode('media'));
    const mediaKey = await Shield.sha256(mediaKeyData);

    await this.storeKey(`shared_key_${contactId}`, sharedKey);
    await this.storeKey(`media_key_${contactId}`, mediaKey);
  }

  /**
   * Check if keys exist for a contact.
   */
  async hasKeysForContact(contactId: string): Promise<boolean> {
    const key = await this.getKey(`shared_key_${contactId}`);
    return key !== null;
  }

  /**
   * Delete all keys and session for a contact.
   */
  async deleteKeysForContact(contactId: string): Promise<void> {
    this.sessions.delete(contactId);
    await this.deleteKey(`shared_key_${contactId}`);
    await this.deleteKey(`media_key_${contactId}`);
    await this.deleteSession(contactId);
  }

  /**
   * Generate QR invitation data.
   */
  async generateQRInvitation(contactId: string, displayName: string): Promise<string> {
    const sharedKey = await this.generateSharedKey(contactId);
    return QRExchange.generateExchangeData(sharedKey, {
      name: displayName,
      ts: Date.now(),
    });
  }

  /**
   * Parse QR invitation data.
   */
  parseQRInvitation(qrData: string): [Uint8Array, Record<string, unknown> | null] {
    return QRExchange.parseExchangeData(qrData);
  }

  // Key storage using IndexedDB
  private async storeKey(keyId: string, key: Uint8Array): Promise<void> {
    const db = await this.openKeyStore();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      const store = tx.objectStore('keys');
      const request = store.put({ id: keyId, key: Array.from(key) });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async getKey(keyId: string): Promise<Uint8Array | null> {
    const db = await this.openKeyStore();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readonly');
      const store = tx.objectStore('keys');
      const request = store.get(keyId);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? new Uint8Array(record.key) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteKey(keyId: string): Promise<void> {
    const db = await this.openKeyStore();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      const store = tx.objectStore('keys');
      const request = store.delete(keyId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async saveSession(contactId: string, session: RatchetSession): Promise<void> {
    const db = await this.openKeyStore();
    const state = session.toState();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const request = store.put({
        id: contactId,
        sendChain: Array.from(state.sendChain),
        recvChain: Array.from(state.recvChain),
        sendCounter: state.sendCounter,
        recvCounter: state.recvCounter,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async loadSession(contactId: string): Promise<RatchetSession | null> {
    const db = await this.openKeyStore();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.get(contactId);
      request.onsuccess = () => {
        const record = request.result;
        if (!record) {
          resolve(null);
        } else {
          resolve(RatchetSession.fromState({
            sendChain: new Uint8Array(record.sendChain),
            recvChain: new Uint8Array(record.recvChain),
            sendCounter: record.sendCounter,
            recvCounter: record.recvCounter,
          }));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteSession(contactId: string): Promise<void> {
    const db = await this.openKeyStore();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const request = store.delete(contactId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private dbPromise: Promise<IDBDatabase> | null = null;

  private async openKeyStore(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('chatguard-shield', 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      };
    });

    return this.dbPromise;
  }
}

/**
 * Media file encryption using Shield.
 */
export class MediaEncryption {
  constructor(private key: Uint8Array) {}

  async encryptFile(file: File): Promise<Blob> {
    const plaintext = new Uint8Array(await file.arrayBuffer());
    const encrypted = await Shield.quickEncrypt(this.key, plaintext);
    return new Blob([encrypted as BlobPart], { type: 'application/octet-stream' });
  }

  async decryptFile(encrypted: Blob): Promise<Blob> {
    const data = new Uint8Array(await encrypted.arrayBuffer());
    const plaintext = await Shield.quickDecrypt(this.key, data);
    return new Blob([plaintext as BlobPart]);
  }
}

// Singleton instance
export const shieldCrypto = new WebShieldCrypto();
