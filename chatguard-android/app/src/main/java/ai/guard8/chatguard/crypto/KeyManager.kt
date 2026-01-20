package ai.guard8.chatguard.crypto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.Base64

/**
 * Secure key storage using Android Keystore and EncryptedSharedPreferences.
 * In production with Shield SDK, this would use SecureKeyStore with TEE backing.
 */
class KeyManager(context: Context) {

    private val masterKey: MasterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .setKeyGenParameterSpec(
            KeyGenParameterSpec.Builder(
                "_chatguard_master_key_",
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        .build()

    private val encryptedPrefs = EncryptedSharedPreferences.create(
        context,
        "chatguard_keys",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun storeKey(keyId: String, key: ByteArray) {
        val encoded = Base64.getEncoder().encodeToString(key)
        encryptedPrefs.edit().putString(keyId, encoded).apply()
    }

    fun retrieveKey(keyId: String): ByteArray? {
        val encoded = encryptedPrefs.getString(keyId, null) ?: return null
        return Base64.getDecoder().decode(encoded)
    }

    fun hasKey(keyId: String): Boolean {
        return encryptedPrefs.contains(keyId)
    }

    fun deleteKey(keyId: String) {
        encryptedPrefs.edit().remove(keyId).apply()
    }

    fun deleteAllKeys() {
        encryptedPrefs.edit().clear().apply()
    }
}
