/**
 * CI stub for the Shield encryption library (ai.dikestra:shield-android).
 * Used when the sibling Shield repo is not checked out.
 * NOT FOR PRODUCTION — throws UnsupportedOperationException at runtime.
 */
package ai.dikestra.shield

import android.content.Context
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private fun notImpl(): Nothing =
    throw UnsupportedOperationException("Shield stub: not available in CI builds")

// ── RatchetSession ────────────────────────────────────────────────────────────

class RatchetSession(private val sharedKey: ByteArray, isInitiator: Boolean) : AutoCloseable {
    fun encrypt(plaintext: ByteArray): ByteArray = notImpl()
    fun decrypt(ciphertext: ByteArray): ByteArray = notImpl()
    override fun close() {}
}

// ── Shield (quick encrypt/decrypt) ───────────────────────────────────────────

object Shield {
    fun quickEncrypt(key: ByteArray, plaintext: ByteArray): ByteArray = notImpl()
    fun quickDecrypt(key: ByteArray, ciphertext: ByteArray): ByteArray = notImpl()
}

// ── ShieldUtils ───────────────────────────────────────────────────────────────

object ShieldUtils {
    const val KEY_SIZE = 32
    fun randomBytes(size: Int): ByteArray = ByteArray(size).also { SecureRandom().nextBytes(it) }
}

// ── StreamCipher ──────────────────────────────────────────────────────────────

class StreamCipher private constructor() : AutoCloseable {
    fun encryptFile(inputPath: String, outputPath: String): Unit = notImpl()
    fun decryptFile(inputPath: String, outputPath: String): Unit = notImpl()
    override fun close() {}

    companion object {
        fun create(key: ByteArray): StreamCipher = StreamCipher()
    }
}

// ── QRExchange ────────────────────────────────────────────────────────────────

object QRExchange {
    fun generateExchangeData(key: ByteArray, metadata: Map<String, Any>): String = notImpl()
    fun parseExchangeData(data: String): Pair<ByteArray, Map<String, Any>?> = notImpl()
}

// ── SecureKeyStore ────────────────────────────────────────────────────────────

class SecureKeyStore(context: Context) {
    private val store = mutableMapOf<String, ByteArray>()
    fun storeKey(keyId: String, key: ByteArray) { store[keyId] = key.copyOf() }
    fun getKey(keyId: String): ByteArray? = store[keyId]?.copyOf()
    fun hasKey(keyId: String): Boolean = store.containsKey(keyId)
    fun deleteKey(keyId: String) { store.remove(keyId) }
}
