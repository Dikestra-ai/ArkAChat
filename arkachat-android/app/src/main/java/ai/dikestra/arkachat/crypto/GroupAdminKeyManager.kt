package ai.dikestra.arkachat.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/**
 * Manages ECDSA P-256 admin signing keys for group control messages.
 *
 * Only the group admin possesses the private key (stored in Android Keystore).
 * All members hold the admin's public key (stored in Group.adminPublicKey) and
 * use it to verify every control message before applying it.
 *
 * Wire format for signatures: 64 bytes raw (r || s), big-endian, zero-padded to 32 each.
 * Android JCE returns DER; this class converts to/from raw for cross-platform compatibility.
 */
class GroupAdminKeyManager {

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val SIGNING_ALGORITHM = "SHA256withECDSA"

        // Domain-separation prefix. Must match groupAdminKeyManager.ts on web.
        const val DOMAIN_SEP = "arkachat:control:v1:"

        // Control message types that require admin signature.
        val ADMIN_CONTROLLED_TYPES = setOf(
            "MEMBER_ADDED", "MEMBER_REMOVED", "KEY_ROTATION",
            "GROUP_INFO_UPDATE", "ADMIN_CHANGE"
        )

        fun keyAlias(groupId: String) = "arkachat_admin_key_$groupId"
    }

    /**
     * Generate a new admin signing keypair for [groupId].
     * The private key is stored in Android Keystore; the public key is returned
     * as X.509 SubjectPublicKeyInfo (DER) for distribution to group members.
     */
    fun generateAdminKey(groupId: String): ByteArray {
        val alias = keyAlias(groupId)
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (!keyStore.containsAlias(alias)) {
            val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
            kpg.initialize(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setKeySize(256)
                    .build()
            )
            kpg.generateKeyPair()
        }
        return keyStore.getCertificate(alias).publicKey.encoded
    }

    /**
     * Return the X.509 SubjectPublicKeyInfo bytes for this device's admin key on [groupId],
     * or null if this device is not the admin.
     */
    fun getPublicKey(groupId: String): ByteArray? {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (!ks.containsAlias(keyAlias(groupId))) return null
        return ks.getCertificate(keyAlias(groupId)).publicKey.encoded
    }

    /** True if this device holds the admin private key for [groupId]. */
    fun isAdmin(groupId: String): Boolean {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        return ks.containsAlias(keyAlias(groupId))
    }

    /** Delete the admin key when this device is no longer the admin. */
    fun deleteAdminKey(groupId: String) {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (ks.containsAlias(keyAlias(groupId))) ks.deleteEntry(keyAlias(groupId))
    }

    /**
     * Sign a control message. Returns 64-byte raw (r || s) signature.
     *
     * @param groupId  group UUID
     * @param type     GroupMessageType name, e.g. "MEMBER_ADDED"
     * @param senderId sender contact ID (empty string for self)
     * @param timestamp Unix millis
     * @param payloadJson JSON-encoded additional payload, or "" if none
     */
    fun signControlMessage(
        groupId: String,
        type: String,
        senderId: String,
        timestamp: Long,
        payloadJson: String = ""
    ): ByteArray {
        require(type in ADMIN_CONTROLLED_TYPES) { "Type $type is not an admin-controlled message" }
        val alias = keyAlias(groupId)
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val privateKey = (ks.getEntry(alias, null) as KeyStore.PrivateKeyEntry).privateKey
        val message = buildSigningInput(type, groupId, senderId, timestamp, payloadJson)
        val derSig = Signature.getInstance(SIGNING_ALGORITHM).apply {
            initSign(privateKey)
            update(message)
        }.sign()
        return derToRaw(derSig)
    }

    /**
     * Verify a control message signature.
     *
     * @param adminPublicKeyBytes X.509 SubjectPublicKeyInfo (DER) of the group admin
     * @param rawSignature 64-byte raw (r || s) signature
     * @return true if the signature is valid
     */
    fun verifyControlMessage(
        adminPublicKeyBytes: ByteArray,
        type: String,
        groupId: String,
        senderId: String,
        timestamp: Long,
        payloadJson: String = "",
        rawSignature: ByteArray
    ): Boolean {
        if (rawSignature.size != 64) return false
        return try {
            val publicKey = KeyFactory.getInstance("EC")
                .generatePublic(X509EncodedKeySpec(adminPublicKeyBytes))
            val message = buildSigningInput(type, groupId, senderId, timestamp, payloadJson)
            val derSig = rawToDer(rawSignature)
            Signature.getInstance(SIGNING_ALGORITHM).apply {
                initVerify(publicKey)
                update(message)
            }.verify(derSig)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Canonical signing input — identical on Android and Web.
     *
     * Format: "arkachat:control:v1:{type}:{groupId}:{senderId}:{timestamp}:{sha256hex(payloadJson)}"
     *
     * sha256hex("") = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
     */
    internal fun buildSigningInput(
        type: String,
        groupId: String,
        senderId: String,
        timestamp: Long,
        payloadJson: String
    ): ByteArray {
        val payloadHash = sha256Hex(payloadJson.toByteArray(Charsets.UTF_8))
        val input = "$DOMAIN_SEP$type:$groupId:$senderId:$timestamp:$payloadHash"
        return input.toByteArray(Charsets.UTF_8)
    }

    private fun sha256Hex(data: ByteArray): String {
        return MessageDigest.getInstance("SHA-256").digest(data)
            .joinToString("") { "%02x".format(it) }
    }

    // ---- DER <-> Raw (r || s) conversion for P-256 ----

    // DER ECDSA → 64-byte raw (r || s), big-endian, zero-padded
    internal fun derToRaw(der: ByteArray): ByteArray {
        var pos = 0
        check(der[pos++].toInt() and 0xFF == 0x30) { "Expected SEQUENCE tag" }
        // Skip sequence length (1 or 2 bytes long-form)
        val lenByte = der[pos++].toInt() and 0xFF
        if (lenByte and 0x80 != 0) pos += lenByte and 0x7F

        // Read r
        check(der[pos++].toInt() and 0xFF == 0x02) { "Expected INTEGER tag for r" }
        val rLen = der[pos++].toInt() and 0xFF
        val rBytes = der.copyOfRange(pos, pos + rLen)
        pos += rLen

        // Read s
        check(der[pos++].toInt() and 0xFF == 0x02) { "Expected INTEGER tag for s" }
        val sLen = der[pos++].toInt() and 0xFF
        val sBytes = der.copyOfRange(pos, pos + sLen)

        val raw = ByteArray(64)
        val r = rBytes.stripLeadingZero()
        val s = sBytes.stripLeadingZero()
        // Right-align within 32-byte slot
        r.copyInto(raw, destinationOffset = 32 - r.size)
        s.copyInto(raw, destinationOffset = 64 - s.size)
        return raw
    }

    // 64-byte raw (r || s) → DER ECDSA
    internal fun rawToDer(raw: ByteArray): ByteArray {
        require(raw.size == 64) { "Raw signature must be 64 bytes" }
        var r = raw.copyOfRange(0, 32).stripLeadingZeros()
        var s = raw.copyOfRange(32, 64).stripLeadingZeros()
        // If high bit set, prepend 0x00 so DER treats value as positive
        if (r[0].toInt() and 0x80 != 0) r = byteArrayOf(0x00) + r
        if (s[0].toInt() and 0x80 != 0) s = byteArrayOf(0x00) + s
        val body = byteArrayOf(0x02.toByte(), r.size.toByte(), *r,
                               0x02.toByte(), s.size.toByte(), *s)
        return byteArrayOf(0x30.toByte(), body.size.toByte(), *body)
    }

    // Remove the one leading 0x00 sign byte that DER may add
    private fun ByteArray.stripLeadingZero(): ByteArray =
        if (size > 1 && this[0] == 0.toByte()) copyOfRange(1, size) else this

    // Remove all leading 0x00 bytes (but keep at least one byte)
    private fun ByteArray.stripLeadingZeros(): ByteArray {
        var start = 0
        while (start < size - 1 && this[start] == 0.toByte()) start++
        return if (start == 0) this else copyOfRange(start, size)
    }
}
