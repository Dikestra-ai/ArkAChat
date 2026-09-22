package ai.dikestra.arkachat.crypto

import android.content.Context
import ai.dikestra.shield.SecureKeyStore

/**
 * Secure key storage using Shield's SecureKeyStore.
 * Provides hardware-backed key storage when available.
 */
class KeyManager(context: Context) {

    private val secureKeyStore = SecureKeyStore(context)

    // Track every key alias we write so deleteAllKeys() can purge them all.
    // Using a synchronized set so concurrent storeKey / deleteAllKeys calls are safe.
    private val storedKeyIds = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    fun storeKey(keyId: String, key: ByteArray) {
        secureKeyStore.storeKey(keyId, key)
        storedKeyIds.add(keyId)
    }

    fun retrieveKey(keyId: String): ByteArray? {
        return secureKeyStore.getKey(keyId)
    }

    fun hasKey(keyId: String): Boolean {
        return secureKeyStore.hasKey(keyId)
    }

    fun deleteKey(keyId: String) {
        secureKeyStore.deleteKey(keyId)
        storedKeyIds.remove(keyId)
    }

    fun deleteAllKeys() {
        // Copy the set to avoid ConcurrentModificationException during iteration.
        val ids = storedKeyIds.toList()
        for (id in ids) {
            secureKeyStore.deleteKey(id)
        }
        storedKeyIds.clear()
    }
}
