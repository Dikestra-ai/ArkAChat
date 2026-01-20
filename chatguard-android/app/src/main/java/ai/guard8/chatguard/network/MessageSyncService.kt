package ai.guard8.chatguard.network

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import ai.guard8.chatguard.ChatGuardApp
import ai.guard8.chatguard.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MessageSyncService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val app = application as ChatGuardApp

        scope.launch {
            app.simplexClient.connect()
        }

        scope.launch {
            app.simplexClient.receiveMessages().collectLatest { encryptedMessage ->
                handleIncomingMessage(encryptedMessage)
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        (application as ChatGuardApp).simplexClient.disconnect()
    }

    private suspend fun handleIncomingMessage(encryptedMessage: EncryptedMessage) {
        val app = application as ChatGuardApp

        // Find contact by queue ID
        val contact = app.database.contactDao().getByQueueId(encryptedMessage.queueId)
            ?: return

        // Decrypt message
        val session = app.shieldCrypto.getSession(contact.id, contact.isInitiator)
        val plaintext = try {
            session.decryptMessage(encryptedMessage.ciphertext)
        } catch (e: Exception) {
            return
        }

        // Save to database
        val message = ai.guard8.chatguard.model.Message(
            id = java.util.UUID.randomUUID().toString(),
            contactId = contact.id,
            content = plaintext,
            timestamp = encryptedMessage.timestamp,
            isSent = false,
            isDelivered = true
        )
        app.database.messageDao().insert(message)

        // Update contact last message time
        app.database.contactDao().updateLastMessageAt(contact.id, encryptedMessage.timestamp)

        // Show notification
        showMessageNotification(contact.displayName, plaintext)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Message Sync",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps ChatGuard connected for messages"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ChatGuard")
            .setContentText("Connected and secure")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun showMessageNotification(senderName: String, message: String) {
        val notificationManager = getSystemService(NotificationManager::class.java)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                MESSAGE_CHANNEL_ID,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
            .setContentTitle(senderName)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    companion object {
        private const val CHANNEL_ID = "chatguard_sync"
        private const val MESSAGE_CHANNEL_ID = "chatguard_messages"
        private const val NOTIFICATION_ID = 1
    }
}
