package ai.guard8.chatguard.crypto

import android.content.Context
import ai.guard8.shield.RatchetSession
import ai.guard8.shield.Shield
import ai.guard8.shield.StreamCipher
import ai.guard8.shield.QRExchange
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * ChatGuard encryption layer using Guard8.ai Shield library.
 * Provides quantum-safe encryption for all messages and media.
 *
 * Uses:
 * - RatchetSession: Per-message encryption with forward secrecy
 * - StreamCipher: Large file encryption (~160 MB/s)
 * - QRExchange: Secure key exchange via QR codes
 */
class ShieldCrypto(private val context: Context) {

    private val keyManager = KeyManager(context)
    private val sessions = ConcurrentHashMap<String, RatchetSession>()

    /**
     * Get or create a RatchetSession for a contact.
     */
    fun getSession(contactId: String, isInitiator: Boolean): RatchetSession {
        return sessions.getOrPut(contactId) {
            val sharedKey = keyManager.retrieveKey("shared_key_$contactId")
                ?: throw IllegalStateException("No shared key found for contact: $contactId")
            RatchetSession(sharedKey, isInitiator)
        }
    }

    /**
     * Encrypt a message using the contact's RatchetSession.
     * Provides forward secrecy - each message uses a unique key.
     */
    fun encryptMessage(contactId: String, isInitiator: Boolean, message: String): ByteArray {
        val session = getSession(contactId, isInitiator)
        return session.encrypt(message.toByteArray(Charsets.UTF_8))
    }

    /**
     * Decrypt a message using the contact's RatchetSession.
     */
    fun decryptMessage(contactId: String, isInitiator: Boolean, ciphertext: ByteArray): String {
        val session = getSession(contactId, isInitiator)
        val plaintext = session.decrypt(ciphertext)
        return String(plaintext, Charsets.UTF_8)
    }

    /**
     * Encrypt a file using StreamCipher for large media files.
     */
    fun encryptFile(contactId: String, inputFile: File, outputFile: File) {
        val mediaKey = keyManager.retrieveKey("media_key_$contactId")
            ?: throw IllegalStateException("No media key found for contact: $contactId")

        StreamCipher.create(mediaKey).use { cipher ->
            cipher.encryptFile(inputFile.absolutePath, outputFile.absolutePath)
        }
    }

    /**
     * Decrypt a file using StreamCipher.
     */
    fun decryptFile(contactId: String, inputFile: File, outputFile: File) {
        val mediaKey = keyManager.retrieveKey("media_key_$contactId")
            ?: throw IllegalStateException("No media key found for contact: $contactId")

        StreamCipher.create(mediaKey).use { cipher ->
            cipher.decryptFile(inputFile.absolutePath, outputFile.absolutePath)
        }
    }

    /**
     * Generate a new shared key for a contact.
     * Creates both chain key (for messages) and media key (for files).
     */
    fun generateSharedKey(contactId: String): ByteArray {
        val sharedKey = Shield.randomBytes(Shield.KEY_SIZE)
        val mediaKey = Shield.randomBytes(Shield.KEY_SIZE)

        keyManager.storeKey("shared_key_$contactId", sharedKey)
        keyManager.storeKey("media_key_$contactId", mediaKey)

        return sharedKey
    }

    /**
     * Import a shared key from a contact (received via QR exchange).
     */
    fun importSharedKey(contactId: String, sharedKey: ByteArray) {
        require(sharedKey.size == Shield.KEY_SIZE) { "Invalid key size" }

        // Derive media key from shared key
        val mediaKey = Shield.sha256(sharedKey + "media".toByteArray())

        keyManager.storeKey("shared_key_$contactId", sharedKey)
        keyManager.storeKey("media_key_$contactId", mediaKey)
    }

    /**
     * Check if keys exist for a contact.
     */
    fun hasKeysForContact(contactId: String): Boolean {
        return keyManager.hasKey("shared_key_$contactId")
    }

    /**
     * Delete all keys for a contact.
     */
    fun deleteKeysForContact(contactId: String) {
        sessions.remove(contactId)?.close()
        keyManager.deleteKey("shared_key_$contactId")
        keyManager.deleteKey("media_key_$contactId")
    }

    /**
     * QR Exchange helper - generate invitation data for QR code.
     */
    fun generateQRInvitation(contactId: String, displayName: String): String {
        val sharedKey = generateSharedKey(contactId)
        return QRExchange.generateExchangeData(sharedKey, mapOf(
            "name" to displayName,
            "ts" to System.currentTimeMillis()
        ))
    }

    /**
     * QR Exchange helper - parse invitation from scanned QR code.
     */
    fun parseQRInvitation(qrData: String): Pair<ByteArray, Map<String, Any>?> {
        return QRExchange.parseExchangeData(qrData)
    }

    /**
     * Quick encrypt using Shield directly (for metadata, etc.)
     */
    fun quickEncrypt(key: ByteArray, plaintext: ByteArray): ByteArray {
        return Shield.quickEncrypt(key, plaintext)
    }

    /**
     * Quick decrypt using Shield directly.
     */
    fun quickDecrypt(key: ByteArray, ciphertext: ByteArray): ByteArray {
        return Shield.quickDecrypt(key, ciphertext)
    }
}
