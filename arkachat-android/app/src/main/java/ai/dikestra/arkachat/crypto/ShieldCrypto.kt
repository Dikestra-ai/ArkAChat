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
        // Domain-separation label for media key derivation.
        // MUST stay in sync with arkachat-web (crypto.ts importSharedKey):
        //   mediaKey = SHA-256(sharedKey || "media")
        private val MEDIA_KEY_LABEL = "media".toByteArray(Charsets.UTF_8)

        /**
         * Deterministically derive the media key from the pairwise shared key.
         *
         * Both sides of a conversation must derive the same media key from the
         * same shared key. This mirrors the web client's derivation exactly
         * (SHA-256 over sharedKey || "media"), so keys agree cross-platform.
         *
         * NOTE: do NOT derive keys from Shield.quickEncrypt output — that
         * output is randomized (fresh nonce, random padding, timestamp) and
         * yields a different value on every call.
         */
        internal fun deriveMediaKey(sharedKey: ByteArray): ByteArray {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            md.update(sharedKey)
            md.update(MEDIA_KEY_LABEL)
            return md.digest() // 32 bytes
        }
    }

    /**
     * Generate a new shared key for a contact.
     * Creates both chain key (for messages) and media key (for files).
     */
    fun generateSharedKey(contactId: String): ByteArray {
        val sharedKey = ShieldUtils.randomBytes(ShieldUtils.KEY_SIZE)

        // Deterministic KDF: mediaKey = SHA-256(sharedKey || "media").
        // Matches importSharedKey() and the web client, so the peer that
        // imports this shared key derives the identical media key.
        val mediaKey = deriveMediaKey(sharedKey)

        keyManager.storeKey("shared_key_$contactId", sharedKey)
        keyManager.storeKey("media_key_$contactId", mediaKey)

        return sharedKey
    }

    /**
     * Import a shared key from a contact (received via QR exchange).
     */
    fun importSharedKey(contactId: String, sharedKey: ByteArray) {
        require(sharedKey.size == ShieldUtils.KEY_SIZE) { "Invalid key size" }

        // Same deterministic derivation as generateSharedKey (and web client).
        val mediaKey = deriveMediaKey(sharedKey)

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
