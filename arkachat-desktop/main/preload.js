const { contextBridge, ipcRenderer } = require('electron');

// --- Input validation (first line of defense; main process re-validates) ---
// keyId: short, printable identifier — never attacker-shaped structures.
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;
const MAX_KEY_BYTES = 8192;

function checkKeyId(keyId) {
  if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId)) {
    return Promise.reject(new Error('keystore: invalid keyId'));
  }
  return null;
}

function checkKeyMaterial(key) {
  const ok =
    (typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_BYTES) ||
    (key instanceof Uint8Array && key.byteLength > 0 && key.byteLength <= MAX_KEY_BYTES);
  if (!ok) {
    return Promise.reject(new Error('keystore: invalid key material'));
  }
  return null;
}

// Expose a minimal, frozen API to the renderer.
//
// SECURITY NOTE: keystore.retrieve() still returns raw key bytes to the
// renderer. Prefer the `crypto` surface below — it performs AES-256-GCM
// encrypt/decrypt in the main process so raw key bytes never cross the bridge
// and a renderer XSS can at most produce or consume ciphertext, not read keys.
contextBridge.exposeInMainWorld('arkachatDesktop', Object.freeze({
  // Keystore operations (validated; main process validates again).
  // Use crypto.encrypt / crypto.decrypt in preference to keystore.retrieve
  // wherever possible so raw key bytes stay in the main process.
  keystore: Object.freeze({
    store: (keyId, key) =>
      checkKeyId(keyId) || checkKeyMaterial(key) ||
      ipcRenderer.invoke('keystore:store', keyId, key),
    retrieve: (keyId) =>
      checkKeyId(keyId) || ipcRenderer.invoke('keystore:retrieve', keyId),
    delete: (keyId) =>
      checkKeyId(keyId) || ipcRenderer.invoke('keystore:delete', keyId),
  }),

  // In-process crypto: AES-256-GCM encrypt/decrypt performed in the main
  // process using the OS-keychain key. The renderer never sees the raw key.
  // Wire format: iv(12) || ciphertext || GCM-tag(16)
  crypto: Object.freeze({
    encrypt: (keyId, plaintext) =>
      checkKeyId(keyId) || ipcRenderer.invoke('crypto:encrypt', keyId, plaintext),
    decrypt: (keyId, ciphertext) =>
      checkKeyId(keyId) || ipcRenderer.invoke('crypto:decrypt', keyId, ciphertext),
  }),

  // Platform info
  platform: process.platform,
  isDesktop: true,

  // App info (resolved in the main process; the sandboxed preload must not
  // require() files from disk)
  getVersion: () => ipcRenderer.invoke('app:get-version'),
}));
