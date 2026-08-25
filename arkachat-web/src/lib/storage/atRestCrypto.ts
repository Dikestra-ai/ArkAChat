/**
 * At-rest encryption for locally persisted data (security review web-crypto #1).
 *
 * All wrapping/unwrapping uses AES-256-GCM via WebCrypto under a
 * NON-EXTRACTABLE CryptoKey that is generated on first use and stored — as a
 * structured-cloned CryptoKey object, never as raw bytes — in its own
 * IndexedDB database. Raw key bytes therefore never touch
 * localStorage/IndexedDB, and script-level attackers cannot export the
 * wrapping key; at most they can use it while executing inside this origin.
 *
 * What this protects against: local disk/forensic access, other OS users,
 * backup extraction, and any attacker who obtains the storage files without
 * code execution in the origin.
 *
 * Documented follow-up (message store): a device-resident key cannot protect
 * against code already running in the origin while the app is in use. The
 * next hardening step is deriving the wrapping key from a user passphrase
 * (PBKDF2/Argon2) or a WebAuthn PRF so persisted data is sealed until the
 * user unlocks the app.
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';

const DB_NAME = 'arkachat-at-rest';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const STORAGE_KEY_ID = 'device-storage-key';
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

/** Marker prefix for encrypted localStorage strings. */
export const ENCRYPTED_PREFIX = 'arkenc:v1:';

let keyPromise: Promise<CryptoKey> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function loadOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb();

  const existing = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(STORAGE_KEY_ID);
    request.onsuccess = () =>
      resolve(request.result ? (request.result.key as CryptoKey) : null);
    request.onerror = () => reject(request.error);
  });
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: raw key bytes can never be read back out
    ['encrypt', 'decrypt']
  );

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id: STORAGE_KEY_ID, key });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return key;
}

/**
 * Get (or lazily create) the device at-rest wrapping key.
 */
export async function getAtRestKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = loadOrCreateKey().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
}

/**
 * Encrypt bytes for persistence. Output layout: iv(12) || ciphertext+tag.
 */
export async function encryptAtRest(plaintext: Uint8Array): Promise<Uint8Array> {
  const key = await getAtRestKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource)
  );
  const out = new Uint8Array(IV_BYTES + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, IV_BYTES);
  return out;
}

/**
 * Decrypt bytes produced by {@link encryptAtRest}.
 */
export async function decryptAtRest(data: Uint8Array): Promise<Uint8Array> {
  if (data.length < IV_BYTES + GCM_TAG_BYTES) {
    throw new Error('At-rest blob too short');
  }
  const key = await getAtRestKey();
  const iv = data.slice(0, IV_BYTES);
  const ciphertext = data.slice(IV_BYTES);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext as BufferSource)
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack limits on large message archives.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt a string for persistence; returns a self-describing prefixed value.
 */
export async function encryptStringAtRest(plaintext: string): Promise<string> {
  const encrypted = await encryptAtRest(new TextEncoder().encode(plaintext));
  return ENCRYPTED_PREFIX + bytesToBase64(encrypted);
}

/**
 * Decrypt a string produced by {@link encryptStringAtRest}.
 */
export async function decryptStringAtRest(stored: string): Promise<string> {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) {
    throw new Error('Not an encrypted at-rest string');
  }
  const decrypted = await decryptAtRest(
    base64ToBytes(stored.slice(ENCRYPTED_PREFIX.length))
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Zustand `persist` storage backed by localStorage with at-rest encryption.
 *
 * - Values are AES-GCM encrypted under the non-extractable device key before
 *   they touch localStorage.
 * - Legacy cleartext blobs (written before this change) are hydrated as-is
 *   and transparently re-persisted encrypted on the next state write.
 * - Storage failures are logged, never thrown, so a persistence problem can
 *   never take down live UI state.
 */
export function createEncryptedStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(name);
      if (raw === null) return null;
      if (!raw.startsWith(ENCRYPTED_PREFIX)) {
        // Legacy cleartext blob — migrate on next setItem.
        try {
          return JSON.parse(raw) as StorageValue<S>;
        } catch {
          return null;
        }
      }
      try {
        return JSON.parse(await decryptStringAtRest(raw)) as StorageValue<S>;
      } catch (error) {
        console.error(`[at-rest] Failed to decrypt persisted store "${name}":`, error);
        return null;
      }
    },
    setItem: async (name, value) => {
      if (typeof window === 'undefined') return;
      try {
        const encrypted = await encryptStringAtRest(JSON.stringify(value));
        window.localStorage.setItem(name, encrypted);
      } catch (error) {
        console.error(`[at-rest] Failed to persist store "${name}":`, error);
      }
    },
    removeItem: (name) => {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(name);
    },
  };
}
