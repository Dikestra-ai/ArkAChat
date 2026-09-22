package ai.dikestra.arkachat.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val ANDROID_KEYSTORE = "AndroidKeyStore"
private const val KEY_ALIAS = "arkachat_biometric_wrapping_key"
private const val KEY_ALGO = KeyProperties.KEY_ALGORITHM_AES
private const val BLOCK_MODE = KeyProperties.BLOCK_MODE_GCM
private const val PADDING = KeyProperties.ENCRYPTION_PADDING_NONE
private const val CIPHER_TRANSFORM = "AES/GCM/NoPadding"
private const val GCM_TAG_LEN = 128

/**
 * Manages an AES-GCM key stored in the Android Keystore that is gated behind
 * biometric (or device credential) authentication.
 *
 * The wrapping key never leaves the Keystore hardware. It is used to wrap and
 * unwrap the app's master key, so that the master key is only accessible when
 * the user has authenticated via [BiometricAuth].
 *
 * Usage:
 *   1. Call [getOrCreateWrappingKey] once to provision the key.
 *   2. Call [encryptCipher] to get a cipher for wrapping; pass it as
 *      [BiometricPrompt.CryptoObject] when enrolling biometric unlock.
 *   3. Call [decryptCipher] to get a cipher for unwrapping; pass it as
 *      [BiometricPrompt.CryptoObject] when the user unlocks the app.
 *   4. Use the cipher from [BiometricPrompt.AuthenticationResult.cryptoObject]
 *      to actually encrypt/decrypt the master key bytes.
 */
class BiometricKeyManager {

    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun isKeyEnrolled(): Boolean = keyStore.containsAlias(KEY_ALIAS)

    fun deleteKey() {
        if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.deleteEntry(KEY_ALIAS)
        }
    }

    fun getOrCreateWrappingKey(): SecretKey {
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
        }

        val keyGen = KeyGenerator.getInstance(KEY_ALGO, ANDROID_KEYSTORE)
        keyGen.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(BLOCK_MODE)
                .setEncryptionPaddings(PADDING)
                .setKeySize(256)
                // Require BIOMETRIC_STRONG or device credential for every cipher init.
                .setUserAuthenticationRequired(true)
                // Invalidate the key if new biometrics are enrolled — prevents a
                // new fingerprint (perhaps attacker's) from unlocking the key.
                .setInvalidatedByBiometricEnrollment(true)
                .build()
        )
        return keyGen.generateKey()
    }

    /**
     * Returns an ENCRYPT-mode Cipher initialised with the wrapping key.
     * Pass this as [BiometricPrompt.CryptoObject] when the user enrols biometric
     * unlock. After authentication, use the cipher to encrypt the master key.
     */
    fun encryptCipher(): Cipher {
        val key = getOrCreateWrappingKey()
        return Cipher.getInstance(CIPHER_TRANSFORM).also { it.init(Cipher.ENCRYPT_MODE, key) }
    }

    /**
     * Returns a DECRYPT-mode Cipher initialised with the wrapping key, using
     * the [iv] produced during the corresponding [encryptCipher] call.
     * Pass this as [BiometricPrompt.CryptoObject] when the user unlocks the app.
     * After authentication, use the cipher to decrypt the wrapped master key.
     */
    fun decryptCipher(iv: ByteArray): Cipher {
        val key = getOrCreateWrappingKey()
        return Cipher.getInstance(CIPHER_TRANSFORM).also {
            it.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LEN, iv))
        }
    }

    /** Encrypt [plaintext] with the authenticated cipher and return iv + ciphertext. */
    fun encryptWithCipher(cipher: Cipher, plaintext: ByteArray): WrappedKey {
        val ciphertext = cipher.doFinal(plaintext)
        return WrappedKey(iv = cipher.iv, ciphertext = ciphertext)
    }

    /** Decrypt [wrapped] with the authenticated cipher. */
    fun decryptWithCipher(cipher: Cipher, wrapped: WrappedKey): ByteArray {
        return cipher.doFinal(wrapped.ciphertext)
    }

    data class WrappedKey(val iv: ByteArray, val ciphertext: ByteArray) {
        fun toBytes(): ByteArray = byteArrayOf(iv.size.toByte()) + iv + ciphertext
        override fun equals(other: Any?) = other is WrappedKey && iv.contentEquals(other.iv) && ciphertext.contentEquals(other.ciphertext)
        override fun hashCode() = 31 * iv.contentHashCode() + ciphertext.contentHashCode()

        companion object {
            fun fromBytes(bytes: ByteArray): WrappedKey {
                val ivLen = bytes[0].toInt() and 0xFF
                return WrappedKey(
                    iv = bytes.copyOfRange(1, 1 + ivLen),
                    ciphertext = bytes.copyOfRange(1 + ivLen, bytes.size)
                )
            }
        }
    }
}
