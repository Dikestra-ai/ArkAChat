---
id: testing-005
title: "Android Instrumentation Tests"
status: done
priority: high
tags: [testing, android, instrumentation, espresso, compose]
dependencies: [frontend-001]
assignee: developer
created: 2026-01-20T21:00:00Z
estimate: 4h
complexity: 3
area: testing
---

# Android Instrumentation Tests

## Context
Write instrumentation tests for the Android app using Compose Testing and Espresso.
Tests run on real devices/emulators connected via Android SDK on localhost.

## Objectives
- Test UI interactions on real Android devices
- Verify end-to-end flows work correctly
- Test camera/QR scanning functionality
- Ensure database operations work correctly
- Test background message handling

## Tasks
- [ ] Set up instrumentation test environment
- [ ] Write contact list UI tests
- [ ] Write chat screen UI tests
- [ ] Write QR scanner integration tests
- [ ] Write database migration tests
- [ ] Write Shield encryption integration tests
- [ ] Write SimpleX connection tests
- [ ] Set up CI with emulator

## Technical Details

### Test Setup
```kotlin
// androidTest/java/ai/dikestra/arkachat/TestSetup.kt
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
abstract class BaseInstrumentationTest {

    @get:Rule(order = 0)
    var hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Inject
    lateinit var database: AppDatabase

    @Inject
    lateinit var shieldCrypto: ShieldCrypto

    @Before
    fun setup() {
        hiltRule.inject()
        // Clear database for clean test state
        runBlocking {
            database.clearAllTables()
        }
    }
}
```

### Contact List UI Tests
```kotlin
// androidTest/java/ai/dikestra/arkachat/ui/ContactListTest.kt
@HiltAndroidTest
class ContactListTest : BaseInstrumentationTest() {

    @Test
    fun contactList_showsEmptyState_whenNoContacts() {
        composeTestRule.apply {
            onNodeWithTag("empty-state").assertIsDisplayed()
            onNodeWithText("No contacts yet").assertIsDisplayed()
            onNodeWithText("Add Contact").assertIsDisplayed()
        }
    }

    @Test
    fun contactList_showsContacts_afterAdding() {
        // Pre-populate database
        runBlocking {
            database.contactDao().insert(
                Contact(
                    id = "test-1",
                    displayName = "Alice",
                    simplexQueueUri = "smp://test",
                    isInitiator = true,
                    createdAt = System.currentTimeMillis()
                )
            )
        }

        composeTestRule.apply {
            onNodeWithTag("contact-list").assertIsDisplayed()
            onNodeWithText("Alice").assertIsDisplayed()
        }
    }

    @Test
    fun contactList_navigatesToChat_onContactClick() {
        // Add contact first
        runBlocking {
            database.contactDao().insert(testContact)
        }

        composeTestRule.apply {
            onNodeWithText("Alice").performClick()
            waitUntil { onNodeWithTag("chat-screen").isDisplayed() }
            onNodeWithTag("chat-screen").assertIsDisplayed()
        }
    }

    @Test
    fun addContactButton_opensQRDialog() {
        composeTestRule.apply {
            onNodeWithTag("add-contact-fab").performClick()
            onNodeWithTag("add-contact-dialog").assertIsDisplayed()
            onNodeWithText("Show My QR Code").assertIsDisplayed()
            onNodeWithText("Scan QR Code").assertIsDisplayed()
        }
    }
}
```

### Chat Screen UI Tests
```kotlin
// androidTest/java/ai/dikestra/arkachat/ui/ChatScreenTest.kt
@HiltAndroidTest
class ChatScreenTest : BaseInstrumentationTest() {

    private val testContactId = "test-contact-1"

    @Before
    fun setupContact() {
        runBlocking {
            database.contactDao().insert(
                Contact(
                    id = testContactId,
                    displayName = "Bob",
                    simplexQueueUri = "smp://test-queue",
                    isInitiator = true,
                    createdAt = System.currentTimeMillis()
                )
            )
        }
    }

    @Test
    fun chatScreen_showsContactName_inHeader() {
        navigateToChat(testContactId)

        composeTestRule.apply {
            onNodeWithTag("chat-header").assertIsDisplayed()
            onNodeWithText("Bob").assertIsDisplayed()
        }
    }

    @Test
    fun chatScreen_showsEmptyState_whenNoMessages() {
        navigateToChat(testContactId)

        composeTestRule.apply {
            onNodeWithTag("empty-chat").assertIsDisplayed()
            onNodeWithText("Send a message to start the conversation").assertIsDisplayed()
        }
    }

    @Test
    fun chatScreen_displaysMessages_inOrder() {
        // Add test messages
        runBlocking {
            database.messageDao().insertAll(listOf(
                Message(
                    id = "msg-1",
                    contactId = testContactId,
                    content = "Hello!",
                    timestamp = 1000L,
                    isOutgoing = true,
                    status = MessageStatus.SENT
                ),
                Message(
                    id = "msg-2",
                    contactId = testContactId,
                    content = "Hi there!",
                    timestamp = 2000L,
                    isOutgoing = false,
                    status = MessageStatus.READ
                )
            ))
        }

        navigateToChat(testContactId)

        composeTestRule.apply {
            onAllNodesWithTag("message-bubble").assertCountEquals(2)
            onNodeWithText("Hello!").assertIsDisplayed()
            onNodeWithText("Hi there!").assertIsDisplayed()
        }
    }

    @Test
    fun sendMessage_addsMessageToList() {
        navigateToChat(testContactId)

        composeTestRule.apply {
            onNodeWithTag("message-input").performTextInput("Test message")
            onNodeWithTag("send-button").performClick()

            // Message should appear in list
            waitUntil { onNodeWithText("Test message").isDisplayed() }
            onNodeWithText("Test message").assertIsDisplayed()
        }
    }

    @Test
    fun sendMessage_showsStatusIndicator() {
        navigateToChat(testContactId)

        composeTestRule.apply {
            onNodeWithTag("message-input").performTextInput("Test")
            onNodeWithTag("send-button").performClick()

            // Should show sending/sent status
            waitUntil { onNodeWithTag("message-status").isDisplayed() }
        }
    }

    private fun navigateToChat(contactId: String) {
        composeTestRule.apply {
            // Navigate to contact's chat
            onNodeWithText("Bob").performClick()
            waitUntil { onNodeWithTag("chat-screen").isDisplayed() }
        }
    }
}
```

### Shield Encryption Integration Tests
```kotlin
// androidTest/java/ai/dikestra/arkachat/crypto/ShieldIntegrationTest.kt
@HiltAndroidTest
class ShieldIntegrationTest : BaseInstrumentationTest() {

    @Inject
    lateinit var shieldCrypto: ShieldCrypto

    @Test
    fun ratchetSession_encryptsAndDecrypts_correctly() {
        val contactId = "test-contact"
        val plaintext = "Hello, secure world!"

        // Encrypt as initiator
        val ciphertext = shieldCrypto.encryptMessage(contactId, true, plaintext)

        // Create new crypto instance to simulate different device
        val shieldCrypto2 = ShieldCrypto(ApplicationProvider.getApplicationContext())

        // Decrypt as responder
        val decrypted = shieldCrypto2.decryptMessage(contactId, false, ciphertext)

        assertEquals(plaintext, decrypted)
    }

    @Test
    fun qrInvitation_generatesValidFormat() {
        val contactId = "test-contact"
        val displayName = "Alice"

        val invitation = shieldCrypto.generateQRInvitation(contactId, displayName)

        // Parse and validate
        val json = JSONObject(invitation)
        assertTrue(json.has("k"))  // Shield key
        assertEquals(displayName, json.getString("n"))
        assertTrue(json.has("ts"))  // Timestamp
    }

    @Test
    fun fileEncryption_worksCorrectly() {
        val contactId = "test-contact"
        val testData = "Test file content".toByteArray()

        // Create temp files
        val inputFile = File.createTempFile("test", ".txt")
        inputFile.writeBytes(testData)

        val outputFile = File.createTempFile("encrypted", ".enc")

        // Encrypt
        shieldCrypto.encryptFile(contactId, inputFile, outputFile)

        // Verify encrypted file is different
        assertNotEquals(testData.toList(), outputFile.readBytes().toList())
        assertTrue(outputFile.length() > testData.size)  // Has overhead

        // Decrypt
        val decryptedFile = File.createTempFile("decrypted", ".txt")
        shieldCrypto.decryptFile(contactId, outputFile, decryptedFile)

        assertEquals(testData.toList(), decryptedFile.readBytes().toList())
    }
}
```

### SimpleX Connection Tests
```kotlin
// androidTest/java/ai/dikestra/arkachat/network/SimpleXConnectionTest.kt
@HiltAndroidTest
class SimpleXConnectionTest : BaseInstrumentationTest() {

    @Inject
    lateinit var simplexClient: SimpleXClient

    @Test
    fun connect_toPublicServers_succeeds() = runBlocking {
        simplexClient.connect()

        // Wait for connection
        delay(5000)

        assertTrue(simplexClient.isConnected())
    }

    @Test
    fun createQueue_returnsValidAddress() = runBlocking {
        simplexClient.connect()
        delay(2000)

        val address = simplexClient.createQueue()

        assertNotNull(address)
        assertTrue(address.server.isNotEmpty())
        assertTrue(address.queueId.isNotEmpty())
    }

    @Test
    fun sendAndReceive_message_works() = runBlocking {
        simplexClient.connect()
        delay(2000)

        // Create queue
        val address = simplexClient.createQueue()

        // Send message
        val testMessage = "Test ${System.currentTimeMillis()}".toByteArray()
        simplexClient.sendMessage(address, testMessage)

        // Receive message
        val received = simplexClient.receiveMessages()
            .first { it.data.contentEquals(testMessage) }

        assertArrayEquals(testMessage, received.data)
    }
}
```

### Database Migration Tests
```kotlin
// androidTest/java/ai/dikestra/arkachat/storage/MigrationTest.kt
@RunWith(AndroidJUnit4::class)
class MigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        AppDatabase::class.java
    )

    @Test
    fun migrate_1_to_2() {
        // Create v1 database
        helper.createDatabase(TEST_DB_NAME, 1).apply {
            execSQL("INSERT INTO contacts (id, displayName, createdAt) VALUES ('1', 'Alice', 1000)")
            close()
        }

        // Run migration
        helper.runMigrationsAndValidate(TEST_DB_NAME, 2, true, MIGRATION_1_2)

        // Verify new columns exist with defaults
        val db = helper.openDatabase(TEST_DB_NAME, Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
            TEST_DB_NAME
        ).build())

        val cursor = db.query("SELECT simplexQueueUri FROM contacts WHERE id = '1'")
        assertTrue(cursor.moveToFirst())
        assertNotNull(cursor.getString(0))
    }

    companion object {
        private const val TEST_DB_NAME = "migration-test"
    }
}
```

### CI Configuration for Emulator
```yaml
# .github/workflows/android-tests.yml
name: Android Tests

on: [push, pull_request]

jobs:
  instrumentation:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Run instrumentation tests
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          target: google_apis
          arch: x86_64
          profile: Nexus 6
          script: |
            cd arkachat-android
            ./gradlew connectedDebugAndroidTest
```

### Run Tests Locally (Android SDK on localhost)
```bash
# List connected devices
adb devices

# Run all instrumentation tests
./gradlew :app:connectedDebugAndroidTest

# Run specific test class
./gradlew :app:connectedDebugAndroidTest \
    -Pandroid.testInstrumentationRunnerArguments.class=ai.dikestra.arkachat.ui.ChatScreenTest

# Run with coverage
./gradlew :app:createDebugCoverageReport
```

## Acceptance Criteria
- [ ] All UI tests pass on emulator
- [ ] All UI tests pass on real device
- [ ] Shield encryption tests pass
- [ ] SimpleX connection tests pass (requires network)
- [ ] Database migration tests pass
- [ ] Tests run in under 10 minutes
- [ ] CI pipeline green
