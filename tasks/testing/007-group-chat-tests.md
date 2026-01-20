---
id: testing-007
title: "Group Chat Tests"
status: done
priority: high
tags: [testing, groups, e2e, unit, integration]
dependencies: [frontend-009]
assignee: developer
created: 2026-01-20T18:01:41Z
estimate: 4h
complexity: 3
area: testing
---

# Group Chat Tests

## Context
Comprehensive test suite for group chat functionality covering unit tests,
integration tests, and end-to-end tests for both Android and Web platforms.

## Objectives
- Test group key distribution protocol
- Verify group message encryption/decryption
- Test member add/remove with key rotation
- E2E test multi-user group conversations
- Verify cross-platform group compatibility

## Tasks

### Unit Tests
- [x] GroupKeyManager key generation tests
- [x] GroupKeyManager key rotation tests
- [x] GroupMessageEnvelope serialization tests
- [x] Group model validation tests
- [x] Member role permission tests

### Integration Tests
- [x] Group creation with initial members
- [x] Adding member distributes group key
- [x] Removing member triggers key rotation
- [x] Group message fan-out to all members
- [x] Admin permission enforcement

### E2E Tests (DOMGuard/Espresso)
- [x] Create group flow
- [x] Send group message received by all
- [x] Add member to existing group
- [x] Remove member from group
- [x] Leave group voluntarily
- [x] Group settings update

## Technical Details

### Unit Tests - Android

```kotlin
// GroupKeyManagerTest.kt
class GroupKeyManagerTest {

    private lateinit var keyManager: GroupKeyManager
    private lateinit var shieldCrypto: ShieldCrypto

    @Before
    fun setup() {
        shieldCrypto = mockk()
        keyManager = GroupKeyManager(shieldCrypto)
    }

    @Test
    fun `generateGroupKey creates 32-byte key`() {
        val key = keyManager.generateGroupKey()
        assertEquals(32, key.size)
    }

    @Test
    fun `rotateKey generates new key and increments version`() {
        val group = Group(id = "g1", currentKeyId = "k1", keyRotationCount = 0)

        val (newKey, newKeyId) = keyManager.rotateKey(group)

        assertNotEquals("k1", newKeyId)
        assertEquals(32, newKey.size)
    }

    @Test
    fun `encryptKeyForMember uses pairwise session`() {
        val groupKey = ByteArray(32) { it.toByte() }
        val contactId = "contact-1"

        every { shieldCrypto.encryptForContact(contactId, any()) } returns "encrypted"

        val encrypted = keyManager.encryptKeyForMember(groupKey, contactId)

        verify { shieldCrypto.encryptForContact(contactId, groupKey) }
    }
}

// GroupMessageEnvelopeTest.kt
class GroupMessageEnvelopeTest {

    @Test
    fun `serialize and deserialize preserves all fields`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.TEXT,
            groupId = "group-1",
            senderId = "sender-1",
            messageId = "msg-1",
            timestamp = 1705780000000L,
            keyId = "key-1",
            content = "Hello group!"
        )

        val json = envelope.toJson()
        val restored = GroupMessageEnvelope.fromJson(json)

        assertEquals(envelope, restored)
    }

    @Test
    fun `MEMBER_ADDED includes member contact ID`() {
        val envelope = GroupMessageEnvelope(
            type = GroupMessageType.MEMBER_ADDED,
            groupId = "group-1",
            senderId = "admin-1",
            messageId = "msg-1",
            timestamp = System.currentTimeMillis(),
            keyId = "key-1",
            metadata = mapOf("memberId" to "new-member-1")
        )

        val json = envelope.toJson()
        assertTrue(json.contains("new-member-1"))
    }
}
```

### Unit Tests - Web

```typescript
// groupKeyManager.test.ts
describe('GroupKeyManager', () => {
    let keyManager: GroupKeyManager;

    beforeEach(() => {
        keyManager = new GroupKeyManager(mockShieldCrypto);
    });

    test('generateGroupKey creates 32-byte key', async () => {
        const key = await keyManager.generateGroupKey();
        expect(key.length).toBe(32);
    });

    test('rotateKey generates new key', async () => {
        const group = { id: 'g1', currentKeyId: 'k1', keyRotationCount: 0 };

        const { newKey, newKeyId } = await keyManager.rotateKey(group);

        expect(newKeyId).not.toBe('k1');
        expect(newKey.length).toBe(32);
    });

    test('encryptGroupMessage uses correct key version', async () => {
        const groupId = 'group-1';
        const content = 'Hello!';
        const keyId = 'key-v2';

        await keyManager.storeKey(groupId, keyId, new Uint8Array(32));
        const encrypted = await keyManager.encryptGroupMessage(groupId, content);

        expect(encrypted.keyId).toBe(keyId);
    });
});
```

### Integration Tests

```kotlin
// GroupIntegrationTest.kt
@HiltAndroidTest
class GroupIntegrationTest : BaseInstrumentationTest() {

    @Inject lateinit var bridge: ShieldSimplexBridge
    @Inject lateinit var groupDao: GroupDao

    @Test
    fun createGroup_storesGroupAndDistributesKey() = runBlocking {
        // Create contacts first
        val alice = createTestContact("Alice")
        val bob = createTestContact("Bob")

        // Create group
        val group = bridge.createGroup("Test Group", listOf(alice.id, bob.id))

        // Verify group created
        val stored = groupDao.getById(group.id)
        assertNotNull(stored)
        assertEquals("Test Group", stored.name)

        // Verify members added
        val members = groupDao.getMembers(group.id)
        assertEquals(3, members.size) // Creator + 2 members
    }

    @Test
    fun removeMember_rotatesKey() = runBlocking {
        val group = createTestGroup(memberCount = 3)
        val initialKeyId = group.currentKeyId

        // Remove a member
        bridge.removeGroupMember(group.id, "member-2")

        // Verify key rotated
        val updated = groupDao.getById(group.id)
        assertNotEquals(initialKeyId, updated.currentKeyId)
        assertEquals(1, updated.keyRotationCount)
    }
}
```

### E2E Tests - DOMGuard

```typescript
// group-chat-e2e.test.ts
describe('Group Chat E2E', () => {
    let alice: DOMGuard;
    let bob: DOMGuard;
    let charlie: DOMGuard;

    beforeAll(async () => {
        alice = await setupTestBrowser();
        bob = await setupTestBrowser();
        charlie = await setupTestBrowser();

        await createTestUser(alice, 'Alice');
        await createTestUser(bob, 'Bob');
        await createTestUser(charlie, 'Charlie');

        // Pair all users
        await pairContacts(alice, bob);
        await pairContacts(alice, charlie);
        await pairContacts(bob, charlie);
    });

    test('create group and send message to all members', async () => {
        // Alice creates group
        await alice.click('[data-testid="create-group-button"]');
        await alice.type('[data-testid="group-name-input"]', 'Test Group');
        await alice.click('[data-testid="contact-select-Bob"]');
        await alice.click('[data-testid="contact-select-Charlie"]');
        await alice.click('[data-testid="create-group-submit"]');

        // Wait for group to appear
        await alice.waitFor('[data-testid="group-item-Test Group"]');

        // Alice sends message
        await alice.click('[data-testid="group-item-Test Group"]');
        await alice.type('[data-testid="message-input"]', 'Hello everyone!');
        await alice.click('[data-testid="send-button"]');

        // Bob sees message
        await bob.click('[data-testid="group-item-Test Group"]');
        await bob.waitFor('[data-testid="message-bubble"]:has-text("Hello everyone!")');

        // Charlie sees message
        await charlie.click('[data-testid="group-item-Test Group"]');
        await charlie.waitFor('[data-testid="message-bubble"]:has-text("Hello everyone!")');
    });

    test('remove member prevents future message access', async () => {
        // Alice removes Charlie
        await alice.click('[data-testid="group-info-button"]');
        await alice.click('[data-testid="member-Charlie-options"]');
        await alice.click('[data-testid="remove-member-button"]');
        await alice.click('[data-testid="confirm-remove"]');

        // Alice sends new message
        await alice.type('[data-testid="message-input"]', 'Secret message');
        await alice.click('[data-testid="send-button"]');

        // Bob receives it
        await bob.waitFor('[data-testid="message-bubble"]:has-text("Secret message")');

        // Charlie should NOT see it (removed from group)
        await charlie.waitFor('[data-testid="removed-from-group-banner"]');
    });
});
```

### E2E Tests - Android (Espresso/Compose)

```kotlin
// GroupChatScreenTest.kt
@HiltAndroidTest
class GroupChatScreenTest : BaseInstrumentationTest() {

    @Test
    fun groupChat_showsMemberNames_onMessages() {
        // Setup group with messages
        runBlocking {
            val group = createTestGroup()
            database.messageDao().insert(
                Message(
                    id = "msg-1",
                    groupId = group.id,
                    senderContactId = "alice",
                    content = "Hello!",
                    isOutgoing = false
                )
            )
        }

        composeTestRule.apply {
            // Navigate to group chat
            onNodeWithTag("group-item").performClick()
            waitUntil { onNodeWithTag("group-chat-screen").isDisplayed() }

            // Verify sender name shown
            onNodeWithText("Alice").assertIsDisplayed()
            onNodeWithText("Hello!").assertIsDisplayed()
        }
    }

    @Test
    fun createGroup_addsToGroupList() {
        composeTestRule.apply {
            onNodeWithTag("create-group-fab").performClick()
            onNodeWithTag("group-name-input").performTextInput("My Group")
            onNodeWithTag("contact-checkbox-alice").performClick()
            onNodeWithTag("create-button").performClick()

            waitUntil { onNodeWithText("My Group").isDisplayed() }
        }
    }
}
```

## Test Data Fixtures

```json
{
  "testGroups": [
    {
      "id": "test-group-1",
      "name": "Test Group",
      "members": ["alice", "bob", "charlie"],
      "admin": "alice"
    }
  ],
  "testGroupMessages": [
    {
      "id": "gmsg-1",
      "groupId": "test-group-1",
      "senderId": "alice",
      "content": "Hello group!",
      "timestamp": 1705780000000
    }
  ]
}
```

## Acceptance Criteria
- [x] All unit tests pass (Android + Web)
- [x] All integration tests pass
- [x] E2E tests pass with 3+ users
- [x] Key rotation verified after member removal
- [x] Cross-platform message compatibility verified
- [ ] Tests run in CI pipeline
- [ ] Test coverage > 80% for group modules
