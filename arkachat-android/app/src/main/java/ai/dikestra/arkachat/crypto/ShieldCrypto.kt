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

    // Tracks all temp files produced by decryptFileToCache() so clearDecryptedCache()
    // can wipe them. CopyOnWriteArrayList is safe for concurrent add/remove.
    private val tempDecryptedFiles = java.util.concurrent.CopyOnWriteArrayList<java.io.File>()

    // Ciphertexts that couldn't be decrypted yet (likely arrived out-of-order).
    // After each successful decrypt we retry these — if the chain has advanced
    // to the right position the message will succeed. Keyed by contactId.
    private val pendingDecrypt = ConcurrentHashMap<String, MutableList<ByteArray>>()

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
     *
     * If decryption fails (e.g. the message arrived out of order), the
     * ciphertext is buffered and retried after each future successful
     * decryption that advances the chain. Recovered plaintexts are returned
     * via the [onRecover] callback so callers can surface them to the UI.
     */
    fun decryptMessage(
        contactId: String,
        isInitiator: Boolean,
        ciphertext: ByteArray,
        onRecover: ((String) -> Unit)? = null
    ): String {
        val session = getSession(contactId, isInitiator)
        val padded = try {
            session.decrypt(ciphertext)
        } catch (e: Exception) {
            // Chain not advanced on failure — buffer for later retry.
            pendingDecrypt.getOrPut(contactId) { mutableListOf() }.add(ciphertext)
            throw IllegalStateException("Decrypt failed, queued for retry", e)
        }
        val plaintext = String(MessagePadding.unpad(padded), Charsets.UTF_8)
        retryPending(contactId, isInitiator, onRecover)
        return plaintext
    }

    private fun retryPending(
        contactId: String,
        isInitiator: Boolean,
        onRecover: ((String) -> Unit)?
    ) {
        val queue = pendingDecrypt[contactId] ?: return
        val remaining = mutableListOf<ByteArray>()
        val session = getSession(contactId, isInitiator)
        for (pending in queue) {
            val recovered = try {
                session.decrypt(pending)
            } catch (_: Exception) { null }
            if (recovered != null) {
                val text = String(MessagePadding.unpad(recovered), Charsets.UTF_8)
                onRecover?.invoke(text)
            } else {
                remaining.add(pending)
            }
        }
        if (remaining.isEmpty()) {
            pendingDecrypt.remove(contactId)
        } else {
            pendingDecrypt[contactId] = remaining
        }
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
     * Decrypt a file using StreamCipher into [outputFile].
     * Prefer [decryptFileToCache] when displaying files — it registers
     * the plaintext for automatic cleanup by [clearDecryptedCache].
     */
    fun decryptFile(contactId: String, inputFile: File, outputFile: File) {
        val mediaKey = keyManager.retrieveKey("media_key_$contactId")
            ?: throw IllegalStateException("No media key found for contact: $contactId")

        StreamCipher.create(mediaKey).use { cipher ->
            cipher.decryptFile(inputFile.absolutePath, outputFile.absolutePath)
        }
    }

    /**
     * Decrypt [inputFile] into a temp file under cacheDir/decrypted/.
     * The returned file is tracked and deleted by [clearDecryptedCache].
     * Call [clearDecryptedCache] from onStop to ensure plaintext files are
     * not left on disk after the user navigates away from a file-viewer screen.
     */
    fun decryptFileToCache(contactId: String, inputFile: File, suffix: String = ""): File {
        val cacheDir = File(context.cacheDir, "decrypted").also { it.mkdirs() }
        val tmpFile = File.createTempFile("plain_", suffix, cacheDir)
        try {
            decryptFile(contactId, inputFile, tmpFile)
        } catch (e: Exception) {
            tmpFile.delete()
            throw e
        }
        tempDecryptedFiles.add(tmpFile)
        return tmpFile
    }

    /**
     * Overwrite-then-delete all plaintext temp files from [decryptFileToCache].
     * Call from Activity.onStop / onPause so plaintext never persists after
     * the user leaves the file viewer.
     */
    fun clearDecryptedCache() {
        val toDelete = tempDecryptedFiles.toList()
        tempDecryptedFiles.clear()
        for (f in toDelete) {
            if (!f.exists()) continue
            try {
                // Best-effort overwrite with zeros before delete to reduce
                // undelete risk (not a guarantee against journaling filesystems).
                f.outputStream().use { out ->
                    val zeros = ByteArray(4096)
                    var remaining = f.length()
                    while (remaining > 0) {
                        val chunk = minOf(remaining, 4096L).toInt()
                        out.write(zeros, 0, chunk)
                        remaining -= chunk
                    }
                }
            } catch (_: Exception) {}
            f.delete()
        }
    }

    companion object {
        // Domain-separation label — MUST stay in sync with arkachat-web crypto.ts:
        //   MEDIA_KEY_LABEL = 'media_key_derivation_v1_pad_32b'
        //   mediaKey = HMAC-SHA256(sharedKey, label)
        private const val MEDIA_KEY_LABEL = "media_key_derivation_v1_pad_32b"

        /**
         * Deterministically derive the media key from the pairwise shared key.
         *
         * Uses HMAC-SHA256(sharedKey, label) — matches the web client exactly
         * so both sides derive the same media key from the same shared key.
         *
         * NOTE: do NOT derive keys from Shield.quickEncrypt output — that
         * output is randomized (fresh nonce, random padding, timestamp) and
         * yields a different value on every call.
         */
        internal fun deriveMediaKey(sharedKey: ByteArray): ByteArray {
            val mac = javax.crypto.Mac.getInstance("HmacSHA256")
            mac.init(javax.crypto.spec.SecretKeySpec(sharedKey, "HmacSHA256"))
            return mac.doFinal(MEDIA_KEY_LABEL.toByteArray(Charsets.UTF_8)) // 32 bytes
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
