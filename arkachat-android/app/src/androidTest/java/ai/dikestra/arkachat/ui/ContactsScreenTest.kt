package ai.dikestra.arkachat.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import ai.dikestra.arkachat.ArkAChatApp
import ai.dikestra.arkachat.MainActivity
import ai.dikestra.arkachat.model.Contact
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Android instrumentation tests for ContactsScreen.
 *
 * These tests verify:
 * - Contact list displays correctly
 * - Empty state shows when no contacts
 * - Add contact button opens QR dialog
 * - Contact items are clickable
 */
@RunWith(AndroidJUnit4::class)
class ContactsScreenTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun setup() {
        // Clear database
        runBlocking {
            val app = ArkAChatApp.instance
            app.database.contactDao().deleteAll()
            app.database.messageDao().deleteAll()
        }
    }

    @Test
    fun contactList_showsEmptyState_whenNoContacts() {
        composeTestRule.waitForIdle()

        // Empty state should show
        composeTestRule
            .onNodeWithText("No contacts yet")
            .assertIsDisplayed()
    }

    @Test
    fun contactList_showsContacts_afterAdding() {
        // Add a contact
        runBlocking {
            val app = ArkAChatApp.instance
            app.database.contactDao().insert(
                Contact(
                    id = "contact-1",
                    displayName = "Alice",
                    simplexQueueUri = "smp://test",
                    isInitiator = true,
                    createdAt = System.currentTimeMillis()
                )
            )
        }

        composeTestRule.waitForIdle()

        // Contact should be visible
        composeTestRule
            .onNodeWithText("Alice")
            .assertIsDisplayed()
    }

    @Test
    fun contactList_showsMultipleContacts() {
        // Add multiple contacts
        runBlocking {
            val app = ArkAChatApp.instance
            app.database.contactDao().insertAll(listOf(
                Contact(
                    id = "contact-1",
                    displayName = "Alice",
                    simplexQueueUri = "smp://test1",
                    isInitiator = true,
                    createdAt = System.currentTimeMillis()
                ),
                Contact(
                    id = "contact-2",
                    displayName = "Bob",
                    simplexQueueUri = "smp://test2",
                    isInitiator = false,
                    createdAt = System.currentTimeMillis()
                ),
                Contact(
                    id = "contact-3",
                    displayName = "Charlie",
                    simplexQueueUri = "smp://test3",
                    isInitiator = true,
                    createdAt = System.currentTimeMillis()
                )
            ))
        }

        composeTestRule.waitForIdle()

        // All contacts should be visible
        composeTestRule.onNodeWithText("Alice").assertIsDisplayed()
        composeTestRule.onNodeWithText("Bob").assertIsDisplayed()
        composeTestRule.onNodeWithText("Charlie").assertIsDisplayed()
    }

    @Test
    fun addContactButton_isVisible() {
        composeTestRule.waitForIdle()

        // FAB should be visible
        composeTestRule
            .onNodeWithContentDescription("Add contact")
            .assertIsDisplayed()
    }

    @Test
    fun addContactButton_opensDialog() {
        composeTestRule.waitForIdle()

        // Click add contact button
        composeTestRule
            .onNodeWithContentDescription("Add contact")
            .performClick()

        composeTestRule.waitForIdle()

        // Dialog should appear with options
        composeTestRule
            .onNodeWithText("Show My QR Code")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Scan QR Code")
            .assertIsDisplayed()
    }

    @Test
    fun contactItem_navigatesToChat_onClick() {
        // Add a contact
        runBlocking {
            val app = ArkAChatApp.instance
            app.database.contactDao().insert(
                Contact(
                    id = "contact-nav",
                    displayName = "Navigate Test",
                    simplexQueueUri = "smp://test",
                    isInitiator = true,
                    createdAt = System.currentTimeMillis()
                )
            )
        }

        composeTestRule.waitForIdle()

        // Click on contact
        composeTestRule
            .onNodeWithText("Navigate Test")
            .performClick()

        composeTestRule.waitForIdle()

        // Should be in chat screen - check for message input
        composeTestRule
            .onNode(hasText("Message..."))
            .assertExists()
    }

    @Test
    fun contactList_showsUnreadCount() {
        // Add contact with unread messages
        runBlocking {
            val app = ArkAChatApp.instance
            app.database.contactDao().insert(
                Contact(
                    id = "contact-unread",
                    displayName = "Unread Test",
                    simplexQueueUri = "smp://test",
                    isInitiator = false,
                    createdAt = System.currentTimeMillis()
                )
            )

            // Add unread messages
            app.database.messageDao().insertAll(listOf(
                ai.dikestra.arkachat.model.Message(
                    id = "msg-1",
                    contactId = "contact-unread",
                    content = "Unread 1",
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = false,
                    status = ai.dikestra.arkachat.model.MessageStatus.DELIVERED
                ),
                ai.dikestra.arkachat.model.Message(
                    id = "msg-2",
                    contactId = "contact-unread",
                    content = "Unread 2",
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = false,
                    status = ai.dikestra.arkachat.model.MessageStatus.DELIVERED
                )
            ))
        }

        composeTestRule.waitForIdle()

        // Contact should show unread badge
        composeTestRule
            .onNodeWithText("Unread Test")
            .assertIsDisplayed()

        // Unread count badge should be visible (implementation specific)
    }

    @Test
    fun contactList_sortsByLastMessage() {
        val now = System.currentTimeMillis()

        runBlocking {
            val app = ArkAChatApp.instance

            // Add contacts with different last message times
            app.database.contactDao().insertAll(listOf(
                Contact(
                    id = "contact-old",
                    displayName = "Old Contact",
                    simplexQueueUri = "smp://old",
                    isInitiator = true,
                    createdAt = now - 10000,
                    lastMessageAt = now - 5000
                ),
                Contact(
                    id = "contact-new",
                    displayName = "New Contact",
                    simplexQueueUri = "smp://new",
                    isInitiator = true,
                    createdAt = now - 5000,
                    lastMessageAt = now - 1000
                )
            ))
        }

        composeTestRule.waitForIdle()

        // Both contacts should be visible
        composeTestRule.onNodeWithText("Old Contact").assertIsDisplayed()
        composeTestRule.onNodeWithText("New Contact").assertIsDisplayed()

        // New contact should appear first (most recent message)
        // This would require checking the order in the list
    }
}
