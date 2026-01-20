package ai.guard8.chatguard

import android.app.Application
import ai.guard8.chatguard.bridge.ShieldSimplexBridge
import ai.guard8.chatguard.crypto.KeyManager
import ai.guard8.chatguard.crypto.ShieldCrypto
import ai.guard8.chatguard.network.SimpleXClient
import ai.guard8.chatguard.storage.ChatDatabase
import ai.guard8.chatguard.storage.EncryptedFileStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class ChatGuardApp : Application() {

    private val appScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    lateinit var shieldCrypto: ShieldCrypto
        private set

    lateinit var simplexClient: SimpleXClient
        private set

    lateinit var database: ChatDatabase
        private set

    lateinit var keyManager: KeyManager
        private set

    lateinit var fileStorage: EncryptedFileStorage
        private set

    lateinit var bridge: ShieldSimplexBridge
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Initialize components
        keyManager = KeyManager(this)
        shieldCrypto = ShieldCrypto(this)
        simplexClient = SimpleXClient(appScope)
        database = ChatDatabase.getInstance(this)
        fileStorage = EncryptedFileStorage(this, keyManager)

        // Create bridge
        bridge = ShieldSimplexBridge(
            shieldCrypto = shieldCrypto,
            simplexClient = simplexClient,
            fileStorage = fileStorage,
            messageDao = database.messageDao(),
            contactDao = database.contactDao()
        )

        // Initialize bridge (connect to SimpleX)
        bridge.initialize()
    }

    override fun onTerminate() {
        super.onTerminate()
        bridge.shutdown()
    }

    companion object {
        lateinit var instance: ChatGuardApp
            private set
    }
}
