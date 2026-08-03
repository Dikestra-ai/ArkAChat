package ai.dikestra.arkachat.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for GroupMessageEnvelope serialization and deserialization.
 */
class GroupMessageEnvelopeTest {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    // ==================== Serialization Tests ====================

    @Test
    fun `TEXT message serializes and deserializes correctly`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.TEXT,
            groupId = "group-1",
            senderId = "sender-1",
            messageId = "msg-1",
            timestamp = 1705780000000L,
            keyId = "key-1",
            content = "Hello group!"
        )

        val serialized = json.encodeToString(envelope)
        val restored = json.decodeFromString<GroupMessageEnvelope>(serialized)

        assertEquals(envelope.type, restored.type)
        assertEquals(envelope.groupId, restored.groupId)
        assertEquals(envelope.senderId, restored.senderId)
        assertEquals(envelope.messageId, restored.messageId)
        assertEquals(envelope.timestamp, restored.timestamp)
        assertEquals(envelope.keyId, restored.keyId)
        assertEquals(envelope.content, restored.content)
    }

    @Test
    fun `FILE message includes fileId`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.FILE,
            groupId = "group-1",
            senderId = "sender-1",
            messageId = "msg-1",
            timestamp = 1705780000000L,
            keyId = "key-1",
            fileId = "file-123"
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain FILE type", serialized.contains("FILE"))
        assertTrue("Should contain fileId", serialized.contains("file-123"))
    }

    @Test
    fun `MEMBER_ADDED includes member contact ID in metadata`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.MEMBER_ADDED,
            groupId = "group-1",
            senderId = "admin-1",
            messageId = "msg-1",
            timestamp = System.currentTimeMillis(),
            keyId = "key-1",
            metadata = mapOf("memberId" to "new-member-1", "memberName" to "Alice")
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain MEMBER_ADDED", serialized.contains("MEMBER_ADDED"))
        assertTrue("Should contain memberId", serialized.contains("new-member-1"))
        assertTrue("Should contain memberName", serialized.contains("Alice"))
    }

    @Test
    fun `MEMBER_REMOVED includes removed member ID`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.MEMBER_REMOVED,
            groupId = "group-1",
            senderId = "admin-1",
            messageId = "msg-1",
            timestamp = System.currentTimeMillis(),
            keyId = "key-1",
            metadata = mapOf("memberId" to "removed-member-1", "reason" to "kicked")
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain MEMBER_REMOVED", serialized.contains("MEMBER_REMOVED"))
        assertTrue("Should contain memberId", serialized.contains("removed-member-1"))
    }

    @Test
    fun `KEY_ROTATION includes new and old key IDs`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.KEY_ROTATION,
            groupId = "group-1",
            senderId = "admin-1",
            messageId = "msg-1",
            timestamp = System.currentTimeMillis(),
            keyId = "new-key-123",
            metadata = mapOf("oldKeyId" to "old-key-456")
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain KEY_ROTATION", serialized.contains("KEY_ROTATION"))
        assertTrue("Should contain new keyId", serialized.contains("new-key-123"))
        assertTrue("Should contain old keyId", serialized.contains("old-key-456"))
    }

    @Test
    fun `GROUP_INFO_UPDATE includes updated fields`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.GROUP_INFO_UPDATE,
            groupId = "group-1",
            senderId = "admin-1",
            messageId = "msg-1",
            timestamp = System.currentTimeMillis(),
            keyId = "key-1",
            metadata = mapOf("field" to "name", "newValue" to "New Group Name")
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain GROUP_INFO_UPDATE", serialized.contains("GROUP_INFO_UPDATE"))
        assertTrue("Should contain field name", serialized.contains("name"))
        assertTrue("Should contain new value", serialized.contains("New Group Name"))
    }

    @Test
    fun `ADMIN_CHANGE includes target and action`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.ADMIN_CHANGE,
            groupId = "group-1",
            senderId = "admin-1",
            messageId = "msg-1",
            timestamp = System.currentTimeMillis(),
            keyId = "key-1",
            metadata = mapOf("targetId" to "member-1", "action" to "promote")
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain ADMIN_CHANGE", serialized.contains("ADMIN_CHANGE"))
        assertTrue("Should contain targetId", serialized.contains("member-1"))
        assertTrue("Should contain action", serialized.contains("promote"))
    }

    @Test
    fun `DELIVERY_RECEIPT includes replyToId`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.DELIVERY_RECEIPT,
            groupId = "group-1",
            senderId = "sender-1",
            messageId = "msg-2",
            timestamp = System.currentTimeMillis(),
            keyId = "key-1",
            replyToId = "msg-1"
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain DELIVERY_RECEIPT", serialized.contains("DELIVERY_RECEIPT"))
        assertTrue("Should contain replyToId", serialized.contains("msg-1"))
    }

    @Test
    fun `READ_RECEIPT includes replyToId`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.READ_RECEIPT,
            groupId = "group-1",
            senderId = "sender-1",
            messageId = "msg-3",
            timestamp = System.currentTimeMillis(),
            keyId = "key-1",
            replyToId = "msg-1"
        )

        val serialized = json.encodeToString(envelope)

        assertTrue("Should contain READ_RECEIPT", serialized.contains("READ_RECEIPT"))
        assertTrue("Should contain replyToId", serialized.contains("msg-1"))
    }

    // ==================== Deserialization Tests ====================

    @Test
    fun `deserialize from minimal JSON`() {
        val jsonStr = """
            {
                "type": "TEXT",
                "groupId": "g1",
                "senderId": "s1",
                "messageId": "m1",
                "timestamp": 1705780000000,
                "keyId": "k1",
                "content": "Hello"
            }
        """.trimIndent()

        val envelope = json.decodeFromString<GroupMessageEnvelope>(jsonStr)

        assertEquals(GroupMessageType.TEXT, envelope.type)
        assertEquals("g1", envelope.groupId)
        assertEquals("s1", envelope.senderId)
        assertEquals("m1", envelope.messageId)
        assertEquals(1705780000000L, envelope.timestamp)
        assertEquals("k1", envelope.keyId)
        assertEquals("Hello", envelope.content)
    }

    @Test
    fun `deserialize handles null optional fields`() {
        val jsonStr = """
            {
                "type": "TEXT",
                "groupId": "g1",
                "senderId": "s1",
                "messageId": "m1",
                "timestamp": 1705780000000,
                "keyId": "k1"
            }
        """.trimIndent()

        val envelope = json.decodeFromString<GroupMessageEnvelope>(jsonStr)

        assertNull(envelope.content)
        assertNull(envelope.fileId)
        assertNull(envelope.replyToId)
        assertNull(envelope.metadata)
    }

    @Test
    fun `deserialize handles metadata map`() {
        val jsonStr = """
            {
                "type": "MEMBER_ADDED",
                "groupId": "g1",
                "senderId": "admin",
                "messageId": "m1",
                "timestamp": 1705780000000,
                "keyId": "k1",
                "metadata": {
                    "memberId": "new-member",
                    "memberName": "Bob"
                }
            }
        """.trimIndent()

        val envelope = json.decodeFromString<GroupMessageEnvelope>(jsonStr)

        assertNotNull(envelope.metadata)
        assertEquals("new-member", envelope.metadata?.get("memberId"))
        assertEquals("Bob", envelope.metadata?.get("memberName"))
    }

    // ==================== Edge Cases ====================

    @Test
    fun `handles empty content string`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.TEXT,
            groupId = "g1",
            senderId = "s1",
            messageId = "m1",
            timestamp = System.currentTimeMillis(),
            keyId = "k1",
            content = ""
        )

        val serialized = json.encodeToString(envelope)
        val restored = json.decodeFromString<GroupMessageEnvelope>(serialized)

        assertEquals("", restored.content)
    }

    @Test
    fun `handles special characters in content`() {
        val specialContent = "Hello! \"quotes\" and \n newlines \t tabs 中文 🎉"
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.TEXT,
            groupId = "g1",
            senderId = "s1",
            messageId = "m1",
            timestamp = System.currentTimeMillis(),
            keyId = "k1",
            content = specialContent
        )

        val serialized = json.encodeToString(envelope)
        val restored = json.decodeFromString<GroupMessageEnvelope>(serialized)

        assertEquals(specialContent, restored.content)
    }

    @Test
    fun `handles very long content`() {
        val longContent = "A".repeat(10000)
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.TEXT,
            groupId = "g1",
            senderId = "s1",
            messageId = "m1",
            timestamp = System.currentTimeMillis(),
            keyId = "k1",
            content = longContent
        )

        val serialized = json.encodeToString(envelope)
        val restored = json.decodeFromString<GroupMessageEnvelope>(serialized)

        assertEquals(10000, restored.content?.length)
    }

    @Test
    fun `all GroupMessageType values are valid`() {
        for (type in GroupMessageType.values()) {
            val envelope = GroupMessageEnvelope(
                type = type,
                groupId = "g1",
                senderId = "s1",
                messageId = "m1",
                timestamp = System.currentTimeMillis(),
                keyId = "k1"
            )

            val serialized = json.encodeToString(envelope)
            val restored = json.decodeFromString<GroupMessageEnvelope>(serialized)

            assertEquals(type, restored.type)
        }
    }
}
