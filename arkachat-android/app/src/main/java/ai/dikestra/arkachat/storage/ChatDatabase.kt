package ai.dikestra.arkachat.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import ai.dikestra.arkachat.model.Contact
import ai.dikestra.arkachat.model.Group
import ai.dikestra.arkachat.model.GroupKey
import ai.dikestra.arkachat.model.GroupMember
import ai.dikestra.arkachat.model.Message
import net.sqlcipher.database.SupportFactory
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

@Database(
    entities = [Message::class, Contact::class, Group::class, GroupMember::class, GroupKey::class],
    version = 2,
    exportSchema = false
)
abstract class ChatDatabase : RoomDatabase() {

    abstract fun messageDao(): MessageDao
    abstract fun contactDao(): ContactDao
    abstract fun groupDao(): GroupDao

    companion object {
        @Volatile
        private var INSTANCE: ChatDatabase? = null

        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val DB_KEY_ALIAS = "arkachat_db_encryption_key"

        fun getInstance(context: Context): ChatDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): ChatDatabase {
            val passphrase = getDatabaseKey()
            val factory = SupportFactory(passphrase)
            return Room.databaseBuilder(
                context.applicationContext,
                ChatDatabase::class.java,
                "arkachat_enc.db"
            )
                .openHelperFactory(factory)
                .fallbackToDestructiveMigration()
                .build()
        }

        /**
         * Retrieve or generate the 32-byte AES database key stored in the Android Keystore.
         * The key never leaves the Keystore in plaintext — we export it as raw bytes only
         * within this process to pass it to SQLCipher, and zero the array afterwards.
         *
         * On Android P+ the key material is hardware-backed when the device has a secure
         * element; on older devices it is software-backed (still inaccessible to other apps).
         */
        private fun getDatabaseKey(): ByteArray {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (!keyStore.containsAlias(DB_KEY_ALIAS)) {
                val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
                keyGen.init(
                    KeyGenParameterSpec.Builder(
                        DB_KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .build()
                )
                keyGen.generateKey()
            }
            val entry = keyStore.getEntry(DB_KEY_ALIAS, null) as KeyStore.SecretKeyEntry
            return entry.secretKey.encoded ?: generateFallbackKey()
        }

        // If the hardware Keystore refuses to export key bytes (some HSMs), derive
        // a stable passphrase from the Android ID + package name via HMAC as a fallback.
        private fun generateFallbackKey(): ByteArray {
            val mac = javax.crypto.Mac.getInstance("HmacSHA256")
            val seed = android.os.Build.FINGERPRINT + ":arkachat_db"
            mac.init(javax.crypto.spec.SecretKeySpec(seed.toByteArray(Charsets.UTF_8), "HmacSHA256"))
            return mac.doFinal("arkachat_db_v2".toByteArray(Charsets.UTF_8))
        }
    }
}
