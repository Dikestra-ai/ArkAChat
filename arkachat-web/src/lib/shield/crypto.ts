/**
 * Shield Browser Implementation using Shield WASM
 *
 * Uses the official Shield Rust core compiled to WASM for cross-platform compatibility.
 * This ensures identical encryption behavior between Web, Android, and iOS clients.
 */

import { pad, unpad } from '../crypto/messagePadding';
import init, {
  WasmRatchetSession,
  randomBytes as wasmRandomBytes,
  sha256 as wasmSha256,
  hmacSha256 as wasmHmacSha256,
  quickEncrypt as wasmQuickEncrypt,
  quickDecrypt as wasmQuickDecrypt,
} from '../shield-wasm/shield_core.js';

// Track WASM initialization
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

/**
 * Initialize Shield WASM module.
 * Must be called before using any Shield functions.
 */
export async function initShield(): Promise<void> {
  if (wasmInitialized) return;

  if (wasmInitPromise) {
    await wasmInitPromise;
    return;
  }

  wasmInitPromise = init().then(() => {
    wasmInitialized = true;
  });

  await wasmInitPromise;
}

/**
 * Ensure WASM is initialized before use.
 */
async function ensureInit(): Promise<void> {
  if (!wasmInitialized) {
    await initShield();
  }
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
 * Wrapper around Shield WASM RatchetSession for identical behavior with Rust/Android.
 *
 * Wire format (from Rust core): nonce(16) || enc(counter || plaintext) || mac(16)
 * MAC computed over: nonce || ciphertext
 */
export class RatchetSession {
  private wasmSession: WasmRatchetSession;
  private _sendCounter = 0;
  private _recvCounter = 0;

  private constructor(wasmSession: WasmRatchetSession) {
    this.wasmSession = wasmSession;
  }

  /**
   * Create a new ratchet session from shared root key.
   * Uses Shield WASM for identical behavior with Rust/Android.
   */
  static async create(rootKey: Uint8Array, isInitiator: boolean): Promise<RatchetSession> {
    await ensureInit();

    if (rootKey.length !== 32) {
      throw new Error('Root key must be 32 bytes');
    }

    const wasmSession = new WasmRatchetSession(rootKey, isInitiator);
    return new RatchetSession(wasmSession);
  }

  /**
   * Restore a session from persisted state by fast-forwarding the KDF chain.
   *
   * The ratchet uses a deterministic KDF chain seeded from root_key, so we can
   * advance the send chain to sendCounter by encrypting dummy messages.
   * The receive chain cannot be fast-forwarded without valid ciphertexts, so
   * incoming messages from before the reload will fail to decrypt (expected).
   */
  static async fromState(state: SessionState): Promise<RatchetSession> {
    await ensureInit();

    const wasmSession = new WasmRatchetSession(state.rootKey, state.isInitiator);
    const session = new RatchetSession(wasmSession);

    // Fast-forward the send KDF chain so our next encrypt uses the correct key
    const dummy = new Uint8Array(1);
    for (let i = 0; i < state.sendCounter; i++) {
      session.wasmSession.encrypt(dummy);
    }
    session._sendCounter = state.sendCounter;
    // recvCounter cannot be restored without ciphertexts; new incoming messages
    // after reload will decrypt correctly as long as the remote also reloaded,
    // or as long as no messages arrived while we were offline.
    session._recvCounter = 0;

    return session;
  }

  /**
   * Export session state for persistence.
   * Note: We store the root key and counters for session restoration.
   */
  toState(rootKey: Uint8Array, isInitiator: boolean): SessionState {
    return {
      rootKey: new Uint8Array(rootKey),
      isInitiator,
      sendCounter: this._sendCounter,
      recvCounter: this._recvCounter,
    };
  }

  /**
   * Encrypt a message with forward secrecy.
   * Uses Shield WASM for identical wire format with Rust/Android:
   * nonce(16) || enc(counter || plaintext) || mac(16)
   */
  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    await ensureInit();

    const encrypted = this.wasmSession.encrypt(plaintext);
    this._sendCounter++;
    return encrypted;
  }

  /**
   * Decrypt a message with forward secrecy.
   * Uses Shield WASM for identical decryption with Rust/Android.
   */
  async decrypt(encrypted: Uint8Array): Promise<Uint8Array | null> {
    await ensureInit();

    try {
      const decrypted = this.wasmSession.decrypt(encrypted);
      this._recvCounter++;
      return decrypted;
    } catch (error) {
      console.error('Shield WASM decryption failed:', error);
      return null;
    }
  }

  get sendCounter(): number {
    return this._sendCounter;
  }

  get recvCounter(): number {
    return this._recvCounter;
  }

  /**
   * Free WASM resources when done.
   */
  free(): void {
    this.wasmSession.free();
  }
}

/**
 * Session state for persistence.
 */
export interface SessionState {
  rootKey: Uint8Array;
  isInitiator: boolean;
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
 * Shield utility functions using WASM.
 */
export const Shield = {
  KEY_SIZE: 32,

  /**
   * Generate random bytes using Shield WASM.
   */
  async randomBytes(length: number): Promise<Uint8Array> {
    await ensureInit();
    return wasmRandomBytes(length);
  },

  /**
   * SHA256 hash using Shield WASM.
   */
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    await ensureInit();
    return wasmSha256(data);
  },

  /**
   * HMAC-SHA256 using Shield WASM.
   */
  async hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    await ensureInit();
    return wasmHmacSha256(key, data);
  },

  /**
   * Quick encrypt with pre-shared key using Shield WASM.
   * Format matches Rust core exactly.
   */
  async quickEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
    await ensureInit();
    return wasmQuickEncrypt(key, plaintext);
  },

  /**
   * Quick decrypt with pre-shared key using Shield WASM.
   */
  async quickDecrypt(key: Uint8Array, encrypted: Uint8Array): Promise<Uint8Array> {
    await ensureInit();
    return wasmQuickDecrypt(key, encrypted);
  },
};

/**
 * Web Shield Crypto - High-level API for ArkAChat web client.
 */
export class WebShieldCrypto {
  private sessions = new Map<string, { session: RatchetSession; rootKey: Uint8Array; isInitiator: boolean }>();

  /**
   * Get or create a RatchetSession for a contact.
   */
  async getSession(contactId: string, isInitiator: boolean): Promise<RatchetSession> {
    const existing = this.sessions.get(contactId);
    if (existing) {
      return existing.session;
    }

    // Check for persisted session
    const persisted = await this.loadSession(contactId);
    if (persisted) {
      this.sessions.set(contactId, persisted);
      return persisted.session;
    }

    // Create new session
    const sharedKey = await this.getKey(`shared_key_${contactId}`);
    if (!sharedKey) {
      throw new Error(`No shared key found for contact: ${contactId}`);
    }

    const session = await RatchetSession.create(sharedKey, isInitiator);
    this.sessions.set(contactId, { session, rootKey: sharedKey, isInitiator });
    await this.saveSession(contactId);
    return session;
  }

  /**
   * Encrypt a message for a contact.
   */
  async encryptMessage(contactId: string, isInitiator: boolean, message: string): Promise<Uint8Array> {
    const session = await this.getSession(contactId, isInitiator);
    const plaintext = new TextEncoder().encode(message);
    const padded = pad(plaintext);
    const ciphertext = await session.encrypt(padded);
    await this.saveSession(contactId);
    return ciphertext;
  }

  /**
   * Decrypt a message from a contact.
   */
  async decryptMessage(contactId: string, isInitiator: boolean, ciphertext: Uint8Array): Promise<string> {
    const session = await this.getSession(contactId, isInitiator);
    const padded = await session.decrypt(ciphertext);
    if (!padded) {
      throw new Error('Decryption failed');
    }
    const plaintext = unpad(padded);
    await this.saveSession(contactId);
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Generate a new shared key for a contact.
   */
  async generateSharedKey(contactId: string): Promise<Uint8Array> {
    await ensureInit();
    const sharedKey = await Shield.randomBytes(Shield.KEY_SIZE);
    const mediaKey = await Shield.randomBytes(Shield.KEY_SIZE);

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
    const existing = this.sessions.get(contactId);
    if (existing) {
      existing.session.free();
    }
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

  private async saveSession(contactId: string): Promise<void> {
    const existing = this.sessions.get(contactId);
    if (!existing) return;

    const db = await this.openKeyStore();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const request = store.put({
        id: contactId,
        rootKey: Array.from(existing.rootKey),
        isInitiator: existing.isInitiator,
        sendCounter: existing.session.sendCounter,
        recvCounter: existing.session.recvCounter,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async loadSession(contactId: string): Promise<{ session: RatchetSession; rootKey: Uint8Array; isInitiator: boolean } | null> {
    const db = await this.openKeyStore();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.get(contactId);
      request.onsuccess = async () => {
        const record = request.result;
        if (!record) {
          resolve(null);
        } else {
          try {
            const rootKey = new Uint8Array(record.rootKey);
            const session = await RatchetSession.fromState({
              rootKey,
              isInitiator: record.isInitiator,
              sendCounter: record.sendCounter ?? 0,
              recvCounter: record.recvCounter ?? 0,
            });
            resolve({ session, rootKey, isInitiator: record.isInitiator });
          } catch (error) {
            console.error('Failed to restore session:', error);
            resolve(null);
          }
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
      const request = indexedDB.open('arkachat-shield', 2);

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
 * Media file encryption using Shield WASM.
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
