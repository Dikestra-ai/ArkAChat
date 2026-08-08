package ai.dikestra.arkachat.network

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}

/**
 * SMP Queue Address - represents a message queue on an SMP server.
 */
data class SMPQueueAddress(
    val server: String,
    val queueId: ByteArray,
    val recipientKey: ByteArray,
    val senderKey: ByteArray? = null
) {
    /**
     * Encode as SMP address URI.
     * Format: smp://server#queueId/recipientKey[/senderKey]
     */
    fun toUri(): String {
        val queueIdB64 = queueId.toBase64Url()
        val recipientKeyB64 = recipientKey.toBase64Url()
        val senderPart = senderKey?.let { "/${it.toBase64Url()}" } ?: ""
        return "smp://$server#$queueIdB64/$recipientKeyB64$senderPart"
    }

    companion object {
        /**
         * Parse SMP address from URI.
         */
        fun fromUri(uri: String): SMPQueueAddress? {
            val regex = Regex("""smp://([^#]+)#([^/]+)/([^/]+)(?:/([^/]+))?""")
            val match = regex.matchEntire(uri) ?: return null

            val (server, queueIdB64, recipientKeyB64, senderKeyB64) = match.destructured
            return SMPQueueAddress(
                server = server,
                queueId = queueIdB64.fromBase64Url(),
                recipientKey = recipientKeyB64.fromBase64Url(),
                senderKey = senderKeyB64.takeIf { it.isNotEmpty() }?.fromBase64Url()
            )
        }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is SMPQueueAddress) return false
        return server == other.server && queueId.contentEquals(other.queueId)
    }

    override fun hashCode(): Int {
        var result = server.hashCode()
        result = 31 * result + queueId.contentHashCode()
        return result
    }
}

/**
 * Encrypted message received from SMP server.
 */
data class SMPMessage(
    val queueAddress: SMPQueueAddress,
    val ciphertext: ByteArray,
    val timestamp: Long,
    val msgId: ByteArray
)

/**
 * SMP Connection Invitation - for QR code pairing.
 */
data class SMPInvitation(
    val connReqUri: String,   // empty string = web-originated invitation (no SMP queue yet)
    val shieldKey: ByteArray,
    val displayName: String,
    val timestamp: Long
) {
    fun toJson(): String {
        return """{"uri":"$connReqUri","k":"${shieldKey.toBase64Url()}","n":"$displayName","ts":$timestamp}"""
    }

    companion object {
        /**
         * Parse QR invitation data.
         *
         * Supports two formats:
         *   Android/legacy: {"uri":"...","k":"...","n":"...","ts":...}
         *   Web (ArkAChat): {"v":1,"k":"...","m":{"name":"...","ts":...}}
         */
        fun fromJson(json: String): SMPInvitation? {
            return try {
                val keyMatch = """"k":"([^"]+)"""".toRegex().find(json)
                    ?: return null

                // Web format: versioned envelope with nested metadata
                val isWebFormat = """"v"\s*:\s*1""".toRegex().containsMatchIn(json)
                if (isWebFormat) {
                    val nameMatch = """"name"\s*:\s*"([^"]+)"""".toRegex().find(json)
                    val tsMatch   = """"ts"\s*:\s*(\d+)""".toRegex().find(json)
                    SMPInvitation(
                        connReqUri  = "",
                        shieldKey   = keyMatch.groupValues[1].fromBase64Url(),
                        displayName = nameMatch?.groupValues?.get(1) ?: "Unknown",
                        timestamp   = tsMatch?.groupValues?.get(1)?.toLong() ?: 0L
                    )
                } else {
                    // Legacy Android format
                    val uriMatch  = """"uri":"([^"]+)"""".toRegex().find(json)
                    val nameMatch = """"n":"([^"]+)"""".toRegex().find(json)
                    val tsMatch   = """"ts":(\d+)""".toRegex().find(json)
                    if (uriMatch != null && nameMatch != null && tsMatch != null) {
                        SMPInvitation(
                            connReqUri  = uriMatch.groupValues[1],
                            shieldKey   = keyMatch.groupValues[1].fromBase64Url(),
                            displayName = nameMatch.groupValues[1],
                            timestamp   = tsMatch.groupValues[1].toLong()
                        )
                    } else null
                }
            } catch (_: Exception) {
                null
            }
        }
    }
}

/**
 * SimpleX Messaging Protocol (SMP) Client.
 *
 * Implements the SMP protocol for zero-identifier messaging.
 * Uses ephemeral message queues with no user identifiers.
 *
 * Public SMP Servers:
 * - smp4.simplex.im
 * - smp5.simplex.im
 * - smp6.simplex.im
 *
 * Protocol Reference:
 * https://github.com/simplex-chat/simplexmq/blob/stable/protocol/simplex-messaging.md
 */
class SimpleXClient(
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
) {
    companion object {
        // Public SMP servers (no API key required)
        val PUBLIC_SMP_SERVERS = listOf(
            "smp4.simplex.im",
            "smp5.simplex.im",
            "smp6.simplex.im"
        )

        // SMP Protocol Commands
        private const val CMD_NEW: Byte = 0x01      // Create new queue
        private const val CMD_KEY: Byte = 0x02      // Sender key confirmation
        private const val CMD_SEND: Byte = 0x03     // Send message
        private const val CMD_MSG: Byte = 0x04      // Message received
        private const val CMD_ACK: Byte = 0x05      // Acknowledge message
        private const val CMD_OFF: Byte = 0x06      // Suspend queue
        private const val CMD_DEL: Byte = 0x07      // Delete queue
        private const val CMD_SUB: Byte = 0x08      // Subscribe to queue
        private const val CMD_END: Byte = 0x09      // Queue ended (deleted by recipient)
        private const val CMD_ERR: Byte = 0x10      // Error response
        private const val CMD_OK: Byte = 0x11       // Success response

        // Queue ID and key sizes
        private const val QUEUE_ID_SIZE = 24
        private const val KEY_SIZE = 32

        private const val DEFAULT_PROXY_PORT = 8443

        private val secureRandom = SecureRandom()
    }

    private val certificatePinner = CertificatePinner.Builder()
        .add("smp4.simplex.im",
            "sha256/sFbsmFMBEWvgBjBSsHB9yOGtZ0GkLSN8YiHhNAOk1ys=",
            "sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=")
        .add("smp5.simplex.im",
            "sha256/sFbsmFMBEWvgBjBSsHB9yOGtZ0GkLSN8YiHhNAOk1ys=",
            "sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=")
        .add("smp6.simplex.im",
            "sha256/sFbsmFMBEWvgBjBSsHB9yOGtZ0GkLSN8YiHhNAOk1ys=",
            "sha256/jQJTbIh0grw0/1TkHSumWb+Fs0Ggogr621gT3PvPKG0=")
        .build()

    private val client = OkHttpClient.Builder()
        .certificatePinner(certificatePinner)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .pingInterval(25 + secureRandom.nextInt(11).toLong(), TimeUnit.SECONDS)
        .build()

    // Connection per server
    private val serverConnections = ConcurrentHashMap<String, WebSocket>()
    private val serverStates = ConcurrentHashMap<String, MutableStateFlow<ConnectionState>>()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val messageChannel = Channel<SMPMessage>(Channel.BUFFERED)
    private val pendingResponses = ConcurrentHashMap<String, CompletableDeferred<ByteArray>>()

    // Queue subscriptions
    private val subscribedQueues = ConcurrentHashMap<String, SMPQueueAddress>()

    private var proxyUrl: String? = null

    /**
     * Configure Shield proxy for transport-layer encryption.
     * When set, all connections route through the proxy.
     * Pass null to disable and use direct connections.
     */
    fun setProxy(url: String?) {
        proxyUrl = url
    }

    /**
     * Connect to multiple SMP servers for redundancy.
     */
    fun connect(servers: List<String> = PUBLIC_SMP_SERVERS) {
        servers.forEach { server ->
            connectToServer(server)
        }
    }

    private fun connectToServer(server: String) {
        val state = serverStates.getOrPut(server) { MutableStateFlow(ConnectionState.DISCONNECTED) }

        if (state.value == ConnectionState.CONNECTING ||
            state.value == ConnectionState.CONNECTED) {
            return
        }

        state.value = ConnectionState.CONNECTING
        updateGlobalState()

        val wsUrl = proxyUrl?.let { proxy ->
            // Route through Shield proxy for transport-layer encryption
            "$proxy/ws/$server:5223"
        } ?: "wss://$server:5223"
        android.util.Log.d("SimpleXClient", "Attempting WebSocket connection to: $wsUrl (proxy=${proxyUrl != null})")
        val request = Request.Builder()
            .url(wsUrl)
            .header("Sec-WebSocket-Protocol", "smp/1")
            .build()

        val socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                state.value = ConnectionState.CONNECTED
                updateGlobalState()

                // Re-subscribe to queues on this server
                resubscribeQueues(server, webSocket)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                handleServerMessage(server, bytes.toByteArray())
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                android.util.Log.e("SimpleXClient", "WebSocket connection failed to $server: ${t.message}", t)
                state.value = ConnectionState.ERROR
                serverConnections.remove(server)
                updateGlobalState()
                scheduleReconnect(server)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                state.value = ConnectionState.DISCONNECTED
                serverConnections.remove(server)
                updateGlobalState()
                if (code != 1000) {
                    scheduleReconnect(server)
                }
            }
        })

        serverConnections[server] = socket
    }

    private fun updateGlobalState() {
        val states = serverStates.values.map { it.value }
        _connectionState.value = when {
            states.any { it == ConnectionState.CONNECTED } -> ConnectionState.CONNECTED
            states.all { it == ConnectionState.ERROR } -> ConnectionState.ERROR
            states.any { it == ConnectionState.CONNECTING } -> ConnectionState.CONNECTING
            else -> ConnectionState.DISCONNECTED
        }
    }

    /**
     * Disconnect from all servers.
     */
    fun disconnect() {
        serverConnections.forEach { (_, socket) ->
            socket.close(1000, "User disconnect")
        }
        serverConnections.clear()
        serverStates.values.forEach { it.value = ConnectionState.DISCONNECTED }
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    /**
     * Create a new message queue on a random SMP server.
     * Returns the queue address that should be shared with the sender.
     */
    suspend fun createQueue(preferredServer: String? = null): SMPQueueAddress {
        val server = preferredServer ?: selectServer()
            ?: throw IllegalStateException("No connected SMP servers")

        val queueId = ByteArray(QUEUE_ID_SIZE).also { secureRandom.nextBytes(it) }
        val recipientKey = ByteArray(KEY_SIZE).also { secureRandom.nextBytes(it) }
        val senderKey = ByteArray(KEY_SIZE).also { secureRandom.nextBytes(it) }

        // Build NEW command: cmd + queueId + recipientKey + senderKey
        val command = ByteArray(1 + QUEUE_ID_SIZE + KEY_SIZE + KEY_SIZE)
        command[0] = CMD_NEW
        recipientKey.copyInto(command, 1)
        senderKey.copyInto(command, 1 + KEY_SIZE)

        val corrId = generateCorrelationId()
        val response = sendCommandWithResponse(server, corrId, command)

        // Parse response - should contain the assigned queueId
        if (response[0] != CMD_OK) {
            throw SMPException("Failed to create queue: ${parseError(response)}")
        }

        val assignedQueueId = response.sliceArray(1 until 1 + QUEUE_ID_SIZE)

        val address = SMPQueueAddress(
            server = server,
            queueId = assignedQueueId,
            recipientKey = recipientKey,
            senderKey = senderKey
        )

        // Subscribe to the new queue
        subscribeToQueue(address)

        return address
    }

    /**
     * Subscribe to receive messages from a queue.
     */
    suspend fun subscribeToQueue(address: SMPQueueAddress) {
        val key = "${address.server}:${address.queueId.toHex()}"
        if (subscribedQueues.containsKey(key)) return

        val command = ByteArray(1 + QUEUE_ID_SIZE + KEY_SIZE)
        command[0] = CMD_SUB
        address.queueId.copyInto(command, 1)
        address.recipientKey.copyInto(command, 1 + QUEUE_ID_SIZE)

        val corrId = generateCorrelationId()
        val response = sendCommandWithResponse(address.server, corrId, command)

        if (response[0] != CMD_OK) {
            throw SMPException("Failed to subscribe: ${parseError(response)}")
        }

        subscribedQueues[key] = address
    }

    /**
     * Send an encrypted message to a queue.
     */
    suspend fun sendMessage(address: SMPQueueAddress, encryptedMessage: ByteArray) {
        requireNotNull(address.senderKey) { "Sender key required to send messages" }

        // Sign the message with sender key (HMAC-SHA256)
        val signature = hmacSha256(address.senderKey, encryptedMessage)

        // Build SEND command: cmd + queueId + signature + message
        val command = ByteArray(1 + QUEUE_ID_SIZE + 32 + encryptedMessage.size)
        command[0] = CMD_SEND
        address.queueId.copyInto(command, 1)
        signature.copyInto(command, 1 + QUEUE_ID_SIZE)
        encryptedMessage.copyInto(command, 1 + QUEUE_ID_SIZE + 32)

        val corrId = generateCorrelationId()
        val response = sendCommandWithResponse(address.server, corrId, command)

        if (response[0] != CMD_OK) {
            throw SMPException("Failed to send message: ${parseError(response)}")
        }
    }

    /**
     * Acknowledge receipt of a message.
     */
    suspend fun acknowledgeMessage(address: SMPQueueAddress, msgId: ByteArray) {
        val command = ByteArray(1 + QUEUE_ID_SIZE + KEY_SIZE + msgId.size)
        command[0] = CMD_ACK
        address.queueId.copyInto(command, 1)
        address.recipientKey.copyInto(command, 1 + QUEUE_ID_SIZE)
        msgId.copyInto(command, 1 + QUEUE_ID_SIZE + KEY_SIZE)

        val corrId = generateCorrelationId()
        sendCommandWithResponse(address.server, corrId, command)
    }

    /**
     * Delete a queue.
     */
    suspend fun deleteQueue(address: SMPQueueAddress) {
        val key = "${address.server}:${address.queueId.toHex()}"
        subscribedQueues.remove(key)

        val command = ByteArray(1 + QUEUE_ID_SIZE + KEY_SIZE)
        command[0] = CMD_DEL
        address.queueId.copyInto(command, 1)
        address.recipientKey.copyInto(command, 1 + QUEUE_ID_SIZE)

        val corrId = generateCorrelationId()
        sendCommandWithResponse(address.server, corrId, command)
    }

    /**
     * Flow of incoming messages.
     */
    fun receiveMessages(): Flow<SMPMessage> = messageChannel.receiveAsFlow()

    /**
     * Create a connection invitation for QR code pairing.
     */
    suspend fun createInvitation(displayName: String, shieldKey: ByteArray): SMPInvitation {
        val queue = createQueue()
        return SMPInvitation(
            connReqUri = queue.toUri(),
            shieldKey = shieldKey,
            displayName = displayName,
            timestamp = System.currentTimeMillis()
        )
    }

    /**
     * Accept a connection invitation (from QR code scan).
     */
    suspend fun acceptInvitation(invitation: SMPInvitation): SMPQueueAddress {
        val queue = SMPQueueAddress.fromUri(invitation.connReqUri)
            ?: throw IllegalArgumentException("Invalid connection request URI")

        // Connect to the server if not already connected
        if (!serverConnections.containsKey(queue.server)) {
            connectToServer(queue.server)
            // Wait for connection
            delay(1000)
        }

        return queue
    }

    // Private helpers

    private fun selectServer(): String? {
        return serverConnections.entries
            .filter { serverStates[it.key]?.value == ConnectionState.CONNECTED }
            .randomOrNull()?.key
    }

    private suspend fun sendCommandWithResponse(
        server: String,
        correlationId: String,
        command: ByteArray
    ): ByteArray {
        val deferred = CompletableDeferred<ByteArray>()
        pendingResponses[correlationId] = deferred

        // Prepend correlation ID (16 bytes) to command
        val corrIdBytes = correlationId.toByteArray(Charsets.UTF_8).copyOf(16)
        val fullCommand = corrIdBytes + command

        val socket = serverConnections[server]
            ?: throw IllegalStateException("Not connected to server: $server")

        socket.send(fullCommand.toByteString())

        return try {
            withTimeout(30_000) {
                deferred.await()
            }
        } finally {
            pendingResponses.remove(correlationId)
        }
    }

    private fun handleServerMessage(server: String, data: ByteArray) {
        if (data.size < 17) return // At least corrId + cmd

        val corrId = String(data.sliceArray(0 until 16), Charsets.UTF_8).trim('\u0000')
        val payload = data.sliceArray(16 until data.size)

        // Check if this is a response to a pending command
        pendingResponses[corrId]?.complete(payload)

        // Handle push messages
        if (payload.isNotEmpty() && payload[0] == CMD_MSG) {
            val msgIdStart = 1
            val msgIdEnd = msgIdStart + 24
            val ciphertextStart = msgIdEnd

            if (data.size > ciphertextStart) {
                val msgId = payload.sliceArray(msgIdStart until msgIdEnd)
                val ciphertext = payload.sliceArray(ciphertextStart until payload.size)

                // Find the queue this message belongs to
                val queue = subscribedQueues.values.firstOrNull { it.server == server }
                if (queue != null) {
                    messageChannel.trySend(
                        SMPMessage(
                            queueAddress = queue,
                            ciphertext = ciphertext,
                            timestamp = System.currentTimeMillis(),
                            msgId = msgId
                        )
                    )
                }
            }
        }
    }

    private fun resubscribeQueues(server: String, socket: WebSocket) {
        subscribedQueues.values
            .filter { it.server == server }
            .forEach { queue ->
                scope.launch {
                    try {
                        subscribeToQueue(queue)
                    } catch (_: Exception) {
                        // Ignore subscription errors on reconnect
                    }
                }
            }
    }

    private fun scheduleReconnect(server: String) {
        scope.launch {
            delay(5000)
            if (serverStates[server]?.value != ConnectionState.CONNECTED) {
                connectToServer(server)
            }
        }
    }

    private fun generateCorrelationId(): String {
        val bytes = ByteArray(8)
        secureRandom.nextBytes(bytes)
        return bytes.toHex()
    }

    private fun parseError(response: ByteArray): String {
        return if (response.size > 1) {
            "Error code: ${response[1]}"
        } else {
            "Unknown error"
        }
    }

    private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }
}

class SMPException(message: String) : Exception(message)

// Extension functions

private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

private fun ByteArray.toBase64Url(): String {
    val base64 = android.util.Base64.encodeToString(this, android.util.Base64.NO_WRAP)
    return base64.replace('+', '-').replace('/', '_').trimEnd('=')
}

private fun String.fromBase64Url(): ByteArray {
    val base64 = this.replace('-', '+').replace('_', '/')
    val padding = (4 - base64.length % 4) % 4
    val padded = base64 + "=".repeat(padding)
    return android.util.Base64.decode(padded, android.util.Base64.NO_WRAP)
}
