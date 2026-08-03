/**
 * OS Keychain integration using keytar.
 * Provides secure storage for encryption keys.
 */

let keytar;

const SERVICE_NAME = 'ArkAChat';

async function initKeystore() {
  try {
    keytar = require('keytar');
    console.log('Keystore initialized with OS keychain');
    return true;
  } catch (error) {
    console.error('Failed to initialize keytar:', error);
    // Fallback to in-memory storage for development
    keytar = createFallbackKeystore();
    return false;
  }
}

function createFallbackKeystore() {
  const store = new Map();
  return {
    setPassword: async (service, account, password) => {
      store.set(`${service}:${account}`, password);
    },
    getPassword: async (service, account) => {
      return store.get(`${service}:${account}`) || null;
    },
    deletePassword: async (service, account) => {
      return store.delete(`${service}:${account}`);
    },
  };
}

async function storeKey(keyId, key) {
  try {
    // Convert Uint8Array to base64 string for storage
    const keyString = typeof key === 'string' ? key : Buffer.from(key).toString('base64');
    await keytar.setPassword(SERVICE_NAME, keyId, keyString);
    return true;
  } catch (error) {
    console.error('Failed to store key:', error);
    return false;
  }
}

async function retrieveKey(keyId) {
  try {
    const keyString = await keytar.getPassword(SERVICE_NAME, keyId);
    if (!keyString) return null;

    // Convert base64 back to Uint8Array
    const buffer = Buffer.from(keyString, 'base64');
    return new Uint8Array(buffer);
  } catch (error) {
    console.error('Failed to retrieve key:', error);
    return null;
  }
}

async function deleteKey(keyId) {
  try {
    await keytar.deletePassword(SERVICE_NAME, keyId);
    return true;
  } catch (error) {
    console.error('Failed to delete key:', error);
    return false;
  }
}

module.exports = {
  initKeystore,
  storeKey,
  retrieveKey,
  deleteKey,
};
