package ai.dikestra.arkachat.crypto

/**
 * Message padding to prevent size-based traffic analysis.
 * Pads plaintext to fixed-size buckets before encryption.
 *
 * Uses a simple length-prefixed scheme:
 * - First 4 bytes: plaintext length (big-endian uint32)
 * - Then: plaintext bytes
 * - Then: zero-fill to next bucket boundary
 *
 * Bucket sizes: 128, 256, 512, 1024, 2048, 4096 bytes.
 * Messages larger than 4096 are padded to the next multiple of 256.
 *
 * Must match Web implementation exactly for cross-platform compatibility.
 */
object MessagePadding {

    private val BUCKET_SIZES = intArrayOf(128, 256, 512, 1024, 2048, 4096)
    private const val LENGTH_PREFIX_SIZE = 4

    /**
     * Pad plaintext to the next bucket size.
     * Format: [4-byte big-endian length] [plaintext] [zero padding]
     */
    fun pad(plaintext: ByteArray): ByteArray {
        val totalNeeded = LENGTH_PREFIX_SIZE + plaintext.size
        val targetSize = nextBucketSize(totalNeeded)

        val padded = ByteArray(targetSize)
        // Write plaintext length as 4-byte big-endian
        padded[0] = (plaintext.size ushr 24).toByte()
        padded[1] = (plaintext.size ushr 16).toByte()
        padded[2] = (plaintext.size ushr 8).toByte()
        padded[3] = plaintext.size.toByte()
        // Copy plaintext after length prefix
        plaintext.copyInto(padded, LENGTH_PREFIX_SIZE)
        // Remaining bytes are zero (ByteArray is zero-initialized)
        return padded
    }

    /**
     * Remove padding from decrypted plaintext.
     * Reads the 4-byte length prefix, then extracts that many bytes.
     */
    fun unpad(padded: ByteArray): ByteArray {
        require(padded.size >= LENGTH_PREFIX_SIZE) { "Padded data too short" }
        val length = ((padded[0].toInt() and 0xFF) shl 24) or
            ((padded[1].toInt() and 0xFF) shl 16) or
            ((padded[2].toInt() and 0xFF) shl 8) or
            (padded[3].toInt() and 0xFF)
        require(length <= padded.size - LENGTH_PREFIX_SIZE) { "Invalid plaintext length: $length" }
        return padded.copyOfRange(LENGTH_PREFIX_SIZE, LENGTH_PREFIX_SIZE + length)
    }

    private fun nextBucketSize(totalSize: Int): Int {
        for (bucket in BUCKET_SIZES) {
            if (bucket >= totalSize) return bucket
        }
        // For sizes beyond max bucket, round up to next multiple of 256
        return ((totalSize + 255) / 256) * 256
    }
}
