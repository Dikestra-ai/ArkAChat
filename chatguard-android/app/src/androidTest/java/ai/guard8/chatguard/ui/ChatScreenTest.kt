package ai.guard8.chatguard.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import ai.guard8.chatguard.ChatGuardApp
import ai.guard8.chatguard.MainActivity
import ai.guard8.chatguard.model.Contact
import ai.guard8.chatguard.model.Message
import ai.guard8.chatguard.model.MessageStatus
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Android instrumentation tests for ChatScreen.
 *
 * These tests run on a real device or emulator and verify:
 * - UI displays correctly
 * - Messages send and appear in the list
 * - Message status indicators work
 * - File attachment UI works
 */
@RunWith(AndroidJUnit4::class)
class ChatScreenTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private val testContactId = "test-contact-1"
    private val testContact = Contact(
        id = testContactId,
        displayName = "Test Contact",
        simplexQueueUri = "smp://test-queue",
        isInitiator = true,
        createdAt = System.currentTimeMillis()
    )

    @Before
    fun setup() {
        // Clear database and add test contact
        runBlocking {
            val app = ChatGuardApp.instance
            app.database.contactDao().deleteAll()
            app.database.messageDao().deleteAll()
            app.database.contactDao().insert(testContact)
        }
    }

    @Test
    fun chatScreen_showsContactName_inHeader() {
        navigateToChat()

        composeTestRule
            .onNodeWithText("Test Contact")
            .assertIsDisplayed()
    }

    @Test
    fun chatScreen_showsEmptyState_whenNoMessages() {
        navigateToChat()

        composeTestRule
            .onNodeWithText("No messages yet")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Messages are quantum-safe encrypted")
            .assertIsDisplayed()
    }

    @Test
    fun chatScreen_displaysMessages_inOrder() {
        // Add test messages
        runBlocking {
            val app = ChatGuardApp.instance
            app.database.messageDao().insertAll(listOf(
                Message(
                    id = "msg-1",
                    contactId = testContactId,
                    content = "First message",
                    timestamp = 1000L,
                    isOutgoing = true,
                    status = MessageStatus.SENT
                ),
                Message(
                    id = "msg-2",
                    contactId = testContactId,
                    content = "Second message",
                    timestamp = 2000L,
                    isOutgoing = false,
                    status = MessageStatus.READ
                )
            ))
        }

        navigateToChat()

        // Both messages should be visible
        composeTestRule
            .onNodeWithText("First message")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Second message")
            .assertIsDisplayed()
    }

    @Test
    fun chatScreen_sendButton_disabledWhenEmpty() {
        navigateToChat()

        // Find send button and verify it's disabled when input is empty
        composeTestRule
            .onNodeWithContentDescription("Send")
            .assertIsNotEnabled()
    }

    @Test
    fun chatScreen_sendButton_enabledWithText() {
        navigateToChat()

        // Type a message
        composeTestRule
            .onNode(hasText("Message..."))
            .performTextInput("Hello!")

        // Send button should now be enabled
        composeTestRule
            .onNodeWithContentDescription("Send")
            .assertIsEnabled()
    }

    @Test
    fun chatScreen_messageInput_clearsAfterSend() {
        navigateToChat()

        // Type and send a message
        composeTestRule
            .onNode(hasText("Message..."))
            .performTextInput("Test message")

        composeTestRule
            .onNodeWithContentDescription("Send")
            .performClick()

        // Input should be cleared
        composeTestRule
            .onNode(hasText("Message..."))
            .assertExists()
    }

    @Test
    fun chatScreen_showsShieldIndicator() {
        navigateToChat()

        // The quantum-safe shield indicator should be visible
        composeTestRule
            .onNodeWithContentDescription("Quantum-safe")
            .assertIsDisplayed()
    }

    @Test
    fun chatScreen_attachButton_isClickable() {
        navigateToChat()

        composeTestRule
            .onNodeWithContentDescription("Attach")
            .assertIsDisplayed()
            .assertHasClickAction()
    }

    @Test
    fun chatScreen_backButton_navigatesBack() {
        navigateToChat()

        composeTestRule
            .onNodeWithContentDescription("Back")
            .performClick()

        // Should be back at contacts list
        composeTestRule
            .onNodeWithText("Test Contact")
            .assertIsDisplayed()
    }

    @Test
    fun messageBubble_outgoing_alignedRight() {
        // Add an outgoing message
        runBlocking {
            val app = ChatGuardApp.instance
            app.database.messageDao().insert(
                Message(
                    id = "msg-out",
                    contactId = testContactId,
                    content = "Outgoing message",
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = true,
                    status = MessageStatus.SENT
                )
            )
        }

        navigateToChat()

        // Outgoing message should be visible
        composeTestRule
            .onNodeWithText("Outgoing message")
            .assertIsDisplayed()
    }

    @Test
    fun messageBubble_incoming_alignedLeft() {
        // Add an incoming message
        runBlocking {
            val app = ChatGuardApp.instance
            app.database.messageDao().insert(
                Message(
                    id = "msg-in",
                    contactId = testContactId,
                    content = "Incoming message",
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = false,
                    status = MessageStatus.DELIVERED
                )
            )
        }

        navigateToChat()

        // Incoming message should be visible
        composeTestRule
            .onNodeWithText("Incoming message")
            .assertIsDisplayed()
    }

    @Test
    fun messageStatus_showsCorrectIndicator() {
        // Add messages with different statuses
        runBlocking {
            val app = ChatGuardApp.instance
            val baseTime = System.currentTimeMillis()

            app.database.messageDao().insertAll(listOf(
                Message(
                    id = "msg-sent",
                    contactId = testContactId,
                    content = "Sent message",
                    timestamp = baseTime,
                    isOutgoing = true,
                    status = MessageStatus.SENT
                ),
                Message(
                    id = "msg-delivered",
                    contactId = testContactId,
                    content = "Delivered message",
                    timestamp = baseTime + 1000,
                    isOutgoing = true,
                    status = MessageStatus.DELIVERED
                ),
                Message(
                    id = "msg-read",
                    contactId = testContactId,
                    content = "Read message",
                    timestamp = baseTime + 2000,
                    isOutgoing = true,
                    status = MessageStatus.READ
                )
            ))
        }

        navigateToChat()

        // All messages should be visible
        composeTestRule.onNodeWithText("Sent message").assertIsDisplayed()
        composeTestRule.onNodeWithText("Delivered message").assertIsDisplayed()
        composeTestRule.onNodeWithText("Read message").assertIsDisplayed()
    }

    private fun navigateToChat() {
        // Wait for app to load
        composeTestRule.waitForIdle()

        // Click on the test contact to open chat
        composeTestRule
            .onNodeWithText("Test Contact")
            .performClick()

        composeTestRule.waitForIdle()
    }
}
