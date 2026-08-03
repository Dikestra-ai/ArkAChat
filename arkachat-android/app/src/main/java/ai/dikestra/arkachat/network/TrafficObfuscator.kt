package ai.dikestra.arkachat.network

import ai.dikestra.arkachat.bridge.MessageEnvelope
import ai.dikestra.arkachat.bridge.MessageType
import ai.dikestra.arkachat.crypto.ShieldCrypto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.SecureRandom
import java.util.UUID

/**
 * Traffic obfuscation to prevent timing and pattern analysis.
 *
 * - Sends encrypted dummy messages at random intervals
 * - Dummy messages are indistinguishable from real messages on the wire
 * - Recipients silently discard DUMMY messages after decryption
 *
 * Configurable via [enabled] and [intervalMs] properties.
 */
class TrafficObfuscator(
    private val shieldCrypto: ShieldCrypto,
    private val simplexClient: SimpleXClient,
    private val scope: CoroutineScope
) {
    var enabled: Boolean = true
    var intervalMs: Long = 30_000L // Base interval between dummy messages

    private val random = SecureRandom()
    private val json = Json { ignoreUnknownKeys = true }
    private val jobs = mutableMapOf<String, Job>()

    /**
     * Start sending dummy messages to a contact's queue.
     */
    fun startForContact(contactId: String, queue: SMPQueueAddress, isInitiator: Boolean) {
        if (jobs.containsKey(contactId)) return

        jobs[contactId] = scope.launch {
            while (isActive && enabled) {
                val jitter = (random.nextDouble() * intervalMs).toLong()
                delay(intervalMs + jitter) // Random interval: 1x to 2x base

                if (!enabled) break

                try {
                    val envelope = MessageEnvelope(
                        type = MessageType.DUMMY,
                        messageId = UUID.randomUUID().toString(),
                        timestamp = System.currentTimeMillis()
                    )
                    val envelopeJson = json.encodeToString(envelope)
                    val encrypted = shieldCrypto.encryptMessage(contactId, isInitiator, envelopeJson)
                    simplexClient.sendMessage(queue, encrypted)
                } catch (_: Exception) {
                    // Silently ignore dummy message failures
                }
            }
        }
    }

    /**
     * Stop sending dummy messages to a contact.
     */
    fun stopForContact(contactId: String) {
        jobs.remove(contactId)?.cancel()
    }

    /**
     * Stop all dummy traffic.
     */
    fun stopAll() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
    }
}
