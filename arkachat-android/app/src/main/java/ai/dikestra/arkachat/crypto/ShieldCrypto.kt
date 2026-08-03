package ai.dikestra.arkachat.crypto

import android.content.Context
import ai.dikestra.shield.RatchetSession
import ai.dikestra.shield.Shield
import ai.dikestra.shield.ShieldUtils
import ai.dikestra.shield.StreamCipher
import ai.dikestra.shield.QRExchange
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * ArkAChat encryption layer using Dikestra AI Shield library.
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
        val padded = MessagePadding.pad(message.toByteArray(Charsets.UTF_8))
        return session.encrypt(padded)
    }

    /**
     * Decrypt a message using the contact's RatchetSession.
     */
    fun decryptMessage(contactId: String, isInitiator: Boolean, ciphertext: ByteArray): String {
        val session = getSession(contactId, isInitiator)
        val padded = session.decrypt(ciphertext)
        val plaintext = MessagePadding.unpad(padded)
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

    companion object {
        // Label for media key derivation - must be at least 24 bytes for proper key derivation
        // (Shield output = nonce(16) + counter(8) + plaintext + mac(16), need 32 bytes after nonce)
        private val MEDIA_KEY_LABEL = "media_key_derivation_v1_pad_32b".toByteArray(Charsets.UTF_8)
    }

    /**
     * Generate a new shared key for a contact.
     * Creates both chain key (for messages) and media key (for files).
     */
    fun generateSharedKey(contactId: String): ByteArray {
        val sharedKey = ShieldUtils.randomBytes(ShieldUtils.KEY_SIZE)

        // Derive media key using Shield encryption
        // Output format: nonce(16) + enc(counter(8) + plaintext) + mac(16)
        // We extract 32 bytes starting after the nonce for the derived key
        val encrypted = Shield.quickEncrypt(sharedKey, MEDIA_KEY_LABEL)
        val mediaKey = encrypted.copyOfRange(16, 48)

        keyManager.storeKey("shared_key_$contactId", sharedKey)
        keyManager.storeKey("media_key_$contactId", mediaKey)

        return sharedKey
    }

    /**
     * Import a shared key from a contact (received via QR exchange).
     */
    fun importSharedKey(contactId: String, sharedKey: ByteArray) {
        require(sharedKey.size == ShieldUtils.KEY_SIZE) { "Invalid key size" }

        // Derive media key using Shield encryption (same derivation as generateSharedKey)
        val encrypted = Shield.quickEncrypt(sharedKey, MEDIA_KEY_LABEL)
        val mediaKey = encrypted.copyOfRange(16, 48)

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
     * @throws IllegalStateException if decryption fails
     */
    fun quickDecrypt(key: ByteArray, ciphertext: ByteArray): ByteArray {
        return Shield.quickDecrypt(key, ciphertext)
    }
}
