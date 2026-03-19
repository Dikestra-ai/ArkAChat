package ai.guard8.chatguard.crypto

import android.content.Context
import ai.dikestra.shield.SecureKeyStore

/**
 * Secure key storage using Shield's SecureKeyStore.
 * Provides hardware-backed key storage when available.
 */
class KeyManager(context: Context) {

    private val secureKeyStore = SecureKeyStore(context)

    fun storeKey(keyId: String, key: ByteArray) {
        secureKeyStore.storeKey(keyId, key)
    }

    fun retrieveKey(keyId: String): ByteArray? {
        return secureKeyStore.getKey(keyId)
    }

    fun hasKey(keyId: String): Boolean {
        return secureKeyStore.hasKey(keyId)
    }

    fun deleteKey(keyId: String) {
        secureKeyStore.deleteKey(keyId)
    }

    fun deleteAllKeys() {
        // SecureKeyStore doesn't have a clear-all method, so we track keys we create
        // For now, this is a no-op - in production we'd track stored key aliases
    }
}
