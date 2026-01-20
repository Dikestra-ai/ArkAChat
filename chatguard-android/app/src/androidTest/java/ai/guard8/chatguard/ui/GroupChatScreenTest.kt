package ai.guard8.chatguard.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import ai.guard8.chatguard.ChatGuardApp
import ai.guard8.chatguard.MainActivity
import ai.guard8.chatguard.model.*
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Android instrumentation tests for GroupChatScreen.
 *
 * These tests run on a real device or emulator and verify:
 * - Group chat UI displays correctly
 * - Group messages show sender names
 * - Group creation flow works
 * - Member management UI works
 */
@RunWith(AndroidJUnit4::class)
class GroupChatScreenTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private val testGroupId = "test-group-1"
    private val testGroup = Group(
        id = testGroupId,
        name = "Test Group",
        createdAt = System.currentTimeMillis(),
        createdBy = "",
        currentKeyId = "test-key-1",
        keyRotationCount = 0
    )

    private val testMembers = listOf(
        GroupMember(
            groupId = testGroupId,
            contactId = "",
            displayName = "Me",
            role = MemberRole.ADMIN,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        ),
        GroupMember(
            groupId = testGroupId,
            contactId = "alice-contact",
            displayName = "Alice",
            role = MemberRole.MEMBER,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        ),
        GroupMember(
            groupId = testGroupId,
            contactId = "bob-contact",
            displayName = "Bob",
            role = MemberRole.MEMBER,
            joinedAt = System.currentTimeMillis(),
            addedBy = ""
        )
    )

    @Before
    fun setup() {
        runBlocking {
            val app = ChatGuardApp.instance
            // Clear existing data
            app.database.groupDao().deleteAll()
            app.database.messageDao().deleteAll()

            // Insert test group
            app.database.groupDao().insert(testGroup)
            app.database.groupDao().insertMembers(testMembers)

            // Insert test group key
            app.database.groupDao().insertKey(
                GroupKey(
                    id = "test-key-1",
                    groupId = testGroupId,
                    encryptedKey = ByteArray(32) { 0x42 },
                    createdAt = System.currentTimeMillis(),
                    rotationNumber = 0
                )
            )
        }
    }

    @Test
    fun groupChatScreen_showsGroupName_inHeader() {
        navigateToGroupChat()

        composeTestRule
            .onNodeWithText("Test Group")
            .assertIsDisplayed()
    }

    @Test
    fun groupChatScreen_showsMemberCount() {
        navigateToGroupChat()

        // Should show "3 members" in the header
        composeTestRule
            .onNodeWithText("3 members")
            .assertIsDisplayed()
    }

    @Test
    fun groupChatScreen_showsEmptyState_whenNoMessages() {
        navigateToGroupChat()

        composeTestRule
            .onNodeWithText("No messages yet")
            .assertIsDisplayed()
    }

    @Test
    fun groupChatScreen_showsSenderName_onIncomingMessages() {
        // Add an incoming group message
        runBlocking {
            val app = ChatGuardApp.instance
            app.database.messageDao().insert(
                Message(
                    id = "gmsg-1",
                    contactId = "alice-contact",
                    groupId = testGroupId,
                    content = "Hello from Alice!",
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = false,
                    status = MessageStatus.DELIVERED
                )
            )
        }

        navigateToGroupChat()

        // Should show sender name
        composeTestRule
            .onNodeWithText("Alice")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Hello from Alice!")
            .assertIsDisplayed()
    }

    @Test
    fun groupChatScreen_doesNotShowSenderName_onOutgoingMessages() {
        // Add an outgoing group message
        runBlocking {
            val app = ChatGuardApp.instance
            app.database.messageDao().insert(
                Message(
                    id = "gmsg-2",
                    contactId = "",
                    groupId = testGroupId,
                    content = "My message",
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = true,
                    status = MessageStatus.SENT
                )
            )
        }

        navigateToGroupChat()

        composeTestRule
            .onNodeWithText("My message")
            .assertIsDisplayed()

        // "Me" should not appear above the message
        composeTestRule
            .onAllNodesWithText("Me")
            .assertCountEquals(0)
    }

    @Test
    fun groupChatScreen_groupsConsecutiveMessagesFromSameSender() {
        // Add multiple messages from the same sender
        runBlocking {
            val app = ChatGuardApp.instance
            val baseTime = System.currentTimeMillis()
            app.database.messageDao().insertAll(listOf(
                Message(
                    id = "gmsg-3",
                    contactId = "alice-contact",
                    groupId = testGroupId,
                    content = "First message",
                    timestamp = baseTime,
                    isOutgoing = false,
                    status = MessageStatus.DELIVERED
                ),
                Message(
                    id = "gmsg-4",
                    contactId = "alice-contact",
                    groupId = testGroupId,
                    content = "Second message",
                    timestamp = baseTime + 1000,
                    isOutgoing = false,
                    status = MessageStatus.DELIVERED
                )
            ))
        }

        navigateToGroupChat()

        // Both messages should be visible
        composeTestRule.onNodeWithText("First message").assertIsDisplayed()
        composeTestRule.onNodeWithText("Second message").assertIsDisplayed()

        // "Alice" should only appear once (above the first message)
        composeTestRule.onAllNodesWithText("Alice").assertCountEquals(1)
    }

    @Test
    fun groupChatScreen_sendButton_disabledWhenEmpty() {
        navigateToGroupChat()

        composeTestRule
            .onNodeWithContentDescription("Send")
            .assertIsNotEnabled()
    }

    @Test
    fun groupChatScreen_sendButton_enabledWithText() {
        navigateToGroupChat()

        composeTestRule
            .onNode(hasText("Message..."))
            .performTextInput("Hello group!")

        composeTestRule
            .onNodeWithContentDescription("Send")
            .assertIsEnabled()
    }

    @Test
    fun groupChatScreen_infoButton_opensGroupInfo() {
        navigateToGroupChat()

        // Click on group info button
        composeTestRule
            .onNodeWithContentDescription("Group info")
            .performClick()

        composeTestRule.waitForIdle()

        // Should show group settings/info screen
        composeTestRule
            .onNodeWithText("Group Info")
            .assertIsDisplayed()
    }

    @Test
    fun groupInfoScreen_showsAllMembers() {
        navigateToGroupChat()

        // Click on group info button
        composeTestRule
            .onNodeWithContentDescription("Group info")
            .performClick()

        composeTestRule.waitForIdle()

        // Should show all members
        composeTestRule.onNodeWithText("Me").assertIsDisplayed()
        composeTestRule.onNodeWithText("Alice").assertIsDisplayed()
        composeTestRule.onNodeWithText("Bob").assertIsDisplayed()
    }

    @Test
    fun groupInfoScreen_showsAdminBadge() {
        navigateToGroupChat()

        // Click on group info button
        composeTestRule
            .onNodeWithContentDescription("Group info")
            .performClick()

        composeTestRule.waitForIdle()

        // Should show Admin badge
        composeTestRule
            .onNodeWithText("Admin")
            .assertIsDisplayed()
    }

    @Test
    fun groupChatScreen_backButton_navigatesBack() {
        navigateToGroupChat()

        composeTestRule
            .onNodeWithContentDescription("Back")
            .performClick()

        composeTestRule.waitForIdle()

        // Should be back at group list
        composeTestRule
            .onNodeWithText("Groups")
            .assertIsDisplayed()
    }

    // ==================== Group Creation Tests ====================

    @Test
    fun groupListScreen_showsCreateButton() {
        navigateToGroupList()

        composeTestRule
            .onNodeWithContentDescription("Create group")
            .assertIsDisplayed()
    }

    @Test
    fun createGroupFlow_showsNameInput() {
        navigateToGroupList()

        composeTestRule
            .onNodeWithContentDescription("Create group")
            .performClick()

        composeTestRule.waitForIdle()

        composeTestRule
            .onNodeWithText("Group name")
            .assertIsDisplayed()
    }

    @Test
    fun createGroupFlow_requiresName() {
        navigateToGroupList()

        composeTestRule
            .onNodeWithContentDescription("Create group")
            .performClick()

        composeTestRule.waitForIdle()

        // Create button should be disabled without a name
        composeTestRule
            .onNodeWithText("Create Group")
            .assertIsNotEnabled()
    }

    @Test
    fun createGroupFlow_requiresMembers() {
        navigateToGroupList()

        composeTestRule
            .onNodeWithContentDescription("Create group")
            .performClick()

        composeTestRule.waitForIdle()

        // Enter group name
        composeTestRule
            .onNode(hasText("Enter group name..."))
            .performTextInput("My New Group")

        // Create button should still be disabled without members
        composeTestRule
            .onNodeWithText("Create Group")
            .assertIsNotEnabled()
    }

    // ==================== Leave Group Tests ====================

    @Test
    fun groupInfoScreen_showsLeaveOption() {
        navigateToGroupChat()

        composeTestRule
            .onNodeWithContentDescription("Group info")
            .performClick()

        composeTestRule.waitForIdle()

        // Should show leave group option
        composeTestRule
            .onNodeWithText("Leave Group")
            .assertIsDisplayed()
    }

    // ==================== Navigation Helpers ====================

    private fun navigateToGroupList() {
        composeTestRule.waitForIdle()

        // Navigate to groups tab
        composeTestRule
            .onNodeWithText("Groups")
            .performClick()

        composeTestRule.waitForIdle()
    }

    private fun navigateToGroupChat() {
        navigateToGroupList()

        // Click on the test group
        composeTestRule
            .onNodeWithText("Test Group")
            .performClick()

        composeTestRule.waitForIdle()
    }
}
