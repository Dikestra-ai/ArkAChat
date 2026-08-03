package ai.dikestra.arkachat.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

sealed class Screen(val route: String) {
    data object Contacts : Screen("contacts")
    data object Chat : Screen("chat/{contactId}") {
        fun createRoute(contactId: String) = "chat/$contactId"
    }
    data object NewContact : Screen("new_contact")
    data object QRScanner : Screen("qr_scanner")
    data object QRDisplay : Screen("qr_display")
    data object Settings : Screen("settings")
}

@Composable
fun ArkAChatNavigation() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Screen.Contacts.route
    ) {
        composable(Screen.Contacts.route) {
            ContactsScreen(
                onContactClick = { contactId ->
                    navController.navigate(Screen.Chat.createRoute(contactId))
                },
                onNewContactClick = {
                    navController.navigate(Screen.NewContact.route)
                },
                onSettingsClick = {
                    navController.navigate(Screen.Settings.route)
                }
            )
        }

        composable(
            route = Screen.Chat.route,
            arguments = listOf(navArgument("contactId") { type = NavType.StringType })
        ) { backStackEntry ->
            val contactId = backStackEntry.arguments?.getString("contactId") ?: return@composable
            ChatScreen(
                contactId = contactId,
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.NewContact.route) {
            NewContactScreen(
                onScanQRClick = { navController.navigate(Screen.QRScanner.route) },
                onShowQRClick = { navController.navigate(Screen.QRDisplay.route) },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.QRScanner.route) {
            QRScannerScreen(
                onQRScanned = { qrData ->
                    // Handle QR code data
                    navController.popBackStack(Screen.Contacts.route, inclusive = false)
                },
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.QRDisplay.route) {
            QRDisplayScreen(
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                onBackClick = { navController.popBackStack() }
            )
        }
    }
}
