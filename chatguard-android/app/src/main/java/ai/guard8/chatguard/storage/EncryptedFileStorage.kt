package ai.guard8.chatguard.storage

import android.content.Context
import ai.guard8.chatguard.crypto.KeyManager
import ai.guard8.shield.Shield
import ai.guard8.shield.StreamCipher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/**
 * Encrypted file metadata.
 */
@Serializable
data class FileMetadata(
    val originalName: String,
    val mimeType: String,
    val originalSize: Long,
    val createdAt: Long = System.currentTimeMillis(),
    val checksum: String? = null  // SHA256 of plaintext
)

/**
 * Reference to an encrypted file.
 */
data class EncryptedFile(
    val id: String,
    val path: String,
    val encryptedSize: Long,
    val contactId: String
)

/**
 * Encrypted file storage using Shield StreamCipher.
 *
 * File format:
 * - Magic header: "SHLD_ENC" (8 bytes)
 * - Version: 0x01 (1 byte)
 * - Metadata length: 4 bytes (little-endian)
 * - Encrypted metadata: JSON with filename, type, size, checksum
 * - Encrypted content: StreamCipher encrypted data
 *
 * All files are stored encrypted at rest. Files can be downloaded
 * either encrypted (for backup/transfer) or decrypted (for viewing).
 */
class EncryptedFileStorage(
    private val context: Context,
    private val keyManager: KeyManager
) {
    companion object {
        private val MAGIC_HEADER = "SHLD_ENC".toByteArray(Charsets.US_ASCII)
        private const val VERSION: Byte = 0x01
        private const val HEADER_SIZE = 8 + 1 + 4  // magic + version + metadata_length

        private val json = Json { ignoreUnknownKeys = true }
    }

    private val storageDir: File by lazy {
        File(context.filesDir, "encrypted_files").also { it.mkdirs() }
    }

    /**
     * Save a file encrypted with Shield.
     *
     * @param contactId Contact ID for key derivation
     * @param inputFile Source file to encrypt
     * @param metadata File metadata (name, type, etc.)
     * @return Reference to the encrypted file
     */
    suspend fun saveEncrypted(
        contactId: String,
        inputFile: File,
        metadata: FileMetadata
    ): EncryptedFile = withContext(Dispatchers.IO) {
        val fileId = UUID.randomUUID().toString()
        val outputFile = File(storageDir, "$fileId.enc")

        // Calculate checksum of plaintext
        val checksum = calculateChecksum(inputFile)
        val metadataWithChecksum = metadata.copy(checksum = checksum)

        // Get or derive file key
        val fileKey = deriveFileKey(contactId, fileId)

        // Encrypt metadata
        val metadataJson = json.encodeToString(metadataWithChecksum)
        val encryptedMetadata = Shield.quickEncrypt(fileKey, metadataJson.toByteArray(Charsets.UTF_8))

        // Write encrypted file
        FileOutputStream(outputFile).use { fos ->
            // Write header
            fos.write(MAGIC_HEADER)
            fos.write(VERSION.toInt())
            fos.write(intToLittleEndian(encryptedMetadata.size))

            // Write encrypted metadata
            fos.write(encryptedMetadata)

            // Encrypt and write content using StreamCipher
            StreamCipher.create(fileKey).use { cipher ->
                FileInputStream(inputFile).use { fis ->
                    cipher.encryptStream(fis, fos)
                }
            }
        }

        EncryptedFile(
            id = fileId,
            path = outputFile.absolutePath,
            encryptedSize = outputFile.length(),
            contactId = contactId
        )
    }

    /**
     * Save from InputStream (for received files).
     */
    suspend fun saveEncrypted(
        contactId: String,
        inputStream: InputStream,
        metadata: FileMetadata
    ): EncryptedFile = withContext(Dispatchers.IO) {
        // Write to temp file first to calculate checksum
        val tempFile = File.createTempFile("incoming_", ".tmp", context.cacheDir)
        try {
            tempFile.outputStream().use { fos ->
                inputStream.copyTo(fos)
            }
            saveEncrypted(contactId, tempFile, metadata)
        } finally {
            tempFile.delete()
        }
    }

    /**
     * Load and decrypt a file.
     *
     * @param encryptedFile Reference to the encrypted file
     * @return Decrypted file in cache directory
     */
    suspend fun loadDecrypted(
        encryptedFile: EncryptedFile
    ): File = withContext(Dispatchers.IO) {
        val inputFile = File(encryptedFile.path)
        require(inputFile.exists()) { "Encrypted file not found: ${encryptedFile.path}" }

        // Read and parse header
        val (metadata, contentOffset) = readHeader(inputFile, encryptedFile.contactId, encryptedFile.id)

        // Create output file with original extension
        val extension = metadata.originalName.substringAfterLast('.', "")
        val outputFile = File(context.cacheDir, "${encryptedFile.id}.$extension")

        // Get file key
        val fileKey = deriveFileKey(encryptedFile.contactId, encryptedFile.id)

        // Decrypt content
        FileInputStream(inputFile).use { fis ->
            fis.skip(contentOffset.toLong())

            StreamCipher.create(fileKey).use { cipher ->
                FileOutputStream(outputFile).use { fos ->
                    cipher.decryptStream(fis, fos)
                }
            }
        }

        // Verify checksum if present
        metadata.checksum?.let { expectedChecksum ->
            val actualChecksum = calculateChecksum(outputFile)
            require(actualChecksum == expectedChecksum) {
                "Checksum mismatch: file may be corrupted"
            }
        }

        outputFile
    }

    /**
     * Download file in encrypted form (for backup/transfer).
     * The file remains encrypted and can be transferred to another device.
     *
     * @param encryptedFile Reference to the encrypted file
     * @return Raw encrypted bytes including header
     */
    suspend fun downloadEncrypted(
        encryptedFile: EncryptedFile
    ): ByteArray = withContext(Dispatchers.IO) {
        val file = File(encryptedFile.path)
        require(file.exists()) { "Encrypted file not found: ${encryptedFile.path}" }
        file.readBytes()
    }

    /**
     * Download file in decrypted form (for viewing/sharing).
     *
     * @param encryptedFile Reference to the encrypted file
     * @return Decrypted file bytes
     */
    suspend fun downloadDecrypted(
        encryptedFile: EncryptedFile
    ): ByteArray = withContext(Dispatchers.IO) {
        val decryptedFile = loadDecrypted(encryptedFile)
        try {
            decryptedFile.readBytes()
        } finally {
            decryptedFile.delete()
        }
    }

    /**
     * Stream decrypted content to an OutputStream.
     * Useful for sharing or displaying large files.
     */
    suspend fun streamDecrypted(
        encryptedFile: EncryptedFile,
        outputStream: OutputStream
    ) = withContext(Dispatchers.IO) {
        val inputFile = File(encryptedFile.path)
        require(inputFile.exists()) { "Encrypted file not found: ${encryptedFile.path}" }

        val (_, contentOffset) = readHeader(inputFile, encryptedFile.contactId, encryptedFile.id)
        val fileKey = deriveFileKey(encryptedFile.contactId, encryptedFile.id)

        FileInputStream(inputFile).use { fis ->
            fis.skip(contentOffset.toLong())

            StreamCipher.create(fileKey).use { cipher ->
                cipher.decryptStream(fis, outputStream)
            }
        }
    }

    /**
     * Get metadata for an encrypted file without decrypting content.
     */
    suspend fun getMetadata(
        encryptedFile: EncryptedFile
    ): FileMetadata = withContext(Dispatchers.IO) {
        val inputFile = File(encryptedFile.path)
        require(inputFile.exists()) { "Encrypted file not found: ${encryptedFile.path}" }
        readHeader(inputFile, encryptedFile.contactId, encryptedFile.id).first
    }

    /**
     * Import an encrypted file received from another device.
     * The file must have been encrypted with the same contact's key.
     */
    suspend fun importEncrypted(
        contactId: String,
        encryptedData: ByteArray,
        fileId: String = UUID.randomUUID().toString()
    ): EncryptedFile = withContext(Dispatchers.IO) {
        // Validate header
        require(encryptedData.size > HEADER_SIZE) { "Invalid encrypted file: too small" }
        require(encryptedData.sliceArray(0 until 8).contentEquals(MAGIC_HEADER)) {
            "Invalid encrypted file: bad magic header"
        }

        val outputFile = File(storageDir, "$fileId.enc")
        outputFile.writeBytes(encryptedData)

        EncryptedFile(
            id = fileId,
            path = outputFile.absolutePath,
            encryptedSize = outputFile.length(),
            contactId = contactId
        )
    }

    /**
     * Delete an encrypted file.
     */
    suspend fun delete(encryptedFile: EncryptedFile) = withContext(Dispatchers.IO) {
        File(encryptedFile.path).delete()
    }

    /**
     * List all encrypted files for a contact.
     */
    suspend fun listFiles(contactId: String): List<EncryptedFile> = withContext(Dispatchers.IO) {
        storageDir.listFiles { file -> file.extension == "enc" }
            ?.mapNotNull { file ->
                try {
                    val id = file.nameWithoutExtension
                    // Try to read header to verify it's for this contact
                    val header = readHeaderRaw(file)
                    if (header != null) {
                        EncryptedFile(
                            id = id,
                            path = file.absolutePath,
                            encryptedSize = file.length(),
                            contactId = contactId
                        )
                    } else null
                } catch (_: Exception) {
                    null
                }
            }
            ?: emptyList()
    }

    // Private helpers

    private fun deriveFileKey(contactId: String, fileId: String): ByteArray {
        val mediaKey = keyManager.retrieveKey("media_key_$contactId")
            ?: throw IllegalStateException("No media key for contact: $contactId")

        // HKDF-like derivation using Shield: HMAC(mediaKey, fileId)
        return Shield.hmacSha256(mediaKey, fileId.toByteArray(Charsets.UTF_8))
    }

    private fun readHeader(
        file: File,
        contactId: String,
        fileId: String
    ): Pair<FileMetadata, Int> {
        FileInputStream(file).use { fis ->
            // Read magic header
            val magic = ByteArray(8)
            fis.read(magic)
            require(magic.contentEquals(MAGIC_HEADER)) { "Invalid file: bad magic header" }

            // Read version
            val version = fis.read().toByte()
            require(version == VERSION) { "Unsupported file version: $version" }

            // Read metadata length
            val lengthBytes = ByteArray(4)
            fis.read(lengthBytes)
            val metadataLength = littleEndianToInt(lengthBytes)

            // Read encrypted metadata
            val encryptedMetadata = ByteArray(metadataLength)
            fis.read(encryptedMetadata)

            // Decrypt metadata
            val fileKey = deriveFileKey(contactId, fileId)
            val metadataJson = Shield.quickDecrypt(fileKey, encryptedMetadata)
            val metadata = json.decodeFromString<FileMetadata>(String(metadataJson, Charsets.UTF_8))

            val contentOffset = HEADER_SIZE + metadataLength
            return Pair(metadata, contentOffset)
        }
    }

    private fun readHeaderRaw(file: File): ByteArray? {
        return try {
            FileInputStream(file).use { fis ->
                val magic = ByteArray(8)
                if (fis.read(magic) != 8) return null
                if (!magic.contentEquals(MAGIC_HEADER)) return null
                magic
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun calculateChecksum(file: File): String {
        // Use Shield for SHA-256 hashing - read file and hash with Shield
        val fileBytes = file.readBytes()
        val hash = Shield.sha256(fileBytes)
        return hash.joinToString("") { "%02x".format(it) }
    }

    private fun intToLittleEndian(value: Int): ByteArray {
        return byteArrayOf(
            (value and 0xFF).toByte(),
            ((value shr 8) and 0xFF).toByte(),
            ((value shr 16) and 0xFF).toByte(),
            ((value shr 24) and 0xFF).toByte()
        )
    }

    private fun littleEndianToInt(bytes: ByteArray): Int {
        return (bytes[0].toInt() and 0xFF) or
                ((bytes[1].toInt() and 0xFF) shl 8) or
                ((bytes[2].toInt() and 0xFF) shl 16) or
                ((bytes[3].toInt() and 0xFF) shl 24)
    }
}

/**
 * Extension to create StreamCipher that encrypts from InputStream to OutputStream.
 */
private fun StreamCipher.encryptStream(input: InputStream, output: OutputStream) {
    val buffer = ByteArray(65536)  // 64KB chunks
    var bytesRead: Int
    while (input.read(buffer).also { bytesRead = it } != -1) {
        val chunk = if (bytesRead == buffer.size) buffer else buffer.copyOf(bytesRead)
        val encrypted = this.encryptChunk(chunk)
        output.write(encrypted)
    }
    // Write final block
    val finalBlock = this.finishEncrypt()
    if (finalBlock.isNotEmpty()) {
        output.write(finalBlock)
    }
}

/**
 * Extension to create StreamCipher that decrypts from InputStream to OutputStream.
 */
private fun StreamCipher.decryptStream(input: InputStream, output: OutputStream) {
    val buffer = ByteArray(65536 + 16)  // 64KB + auth tag
    var bytesRead: Int
    while (input.read(buffer).also { bytesRead = it } != -1) {
        val chunk = if (bytesRead == buffer.size) buffer else buffer.copyOf(bytesRead)
        val decrypted = this.decryptChunk(chunk)
        output.write(decrypted)
    }
    // Verify and write final block
    val finalBlock = this.finishDecrypt()
    if (finalBlock.isNotEmpty()) {
        output.write(finalBlock)
    }
}
