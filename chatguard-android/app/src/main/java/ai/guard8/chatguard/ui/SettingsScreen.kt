package ai.guard8.chatguard.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import ai.guard8.chatguard.storage.EncryptedPrefs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBackClick: () -> Unit
) {
    val context = LocalContext.current
    val prefs = remember { EncryptedPrefs(context) }

    var biometricEnabled by remember {
        mutableStateOf(prefs.getBoolean(EncryptedPrefs.KEY_BIOMETRIC_ENABLED, false))
    }
    var notificationsEnabled by remember {
        mutableStateOf(prefs.getBoolean(EncryptedPrefs.KEY_NOTIFICATIONS_ENABLED, true))
    }
    var showPreview by remember {
        mutableStateOf(prefs.getBoolean(EncryptedPrefs.KEY_SHOW_PREVIEW, true))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Security Section
            SettingsSection(title = "Security") {
                SettingsSwitch(
                    icon = Icons.Default.Fingerprint,
                    title = "Biometric Lock",
                    subtitle = "Require fingerprint or face to open",
                    checked = biometricEnabled,
                    onCheckedChange = {
                        biometricEnabled = it
                        prefs.setBoolean(EncryptedPrefs.KEY_BIOMETRIC_ENABLED, it)
                    }
                )

                SettingsItem(
                    icon = Icons.Default.Shield,
                    title = "Encryption",
                    subtitle = "256-bit quantum-safe (EXPTIME-hard)",
                    onClick = { }
                )
            }

            // Notifications Section
            SettingsSection(title = "Notifications") {
                SettingsSwitch(
                    icon = Icons.Default.Notifications,
                    title = "Enable Notifications",
                    subtitle = "Get notified of new messages",
                    checked = notificationsEnabled,
                    onCheckedChange = {
                        notificationsEnabled = it
                        prefs.setBoolean(EncryptedPrefs.KEY_NOTIFICATIONS_ENABLED, it)
                    }
                )

                SettingsSwitch(
                    icon = Icons.Default.Visibility,
                    title = "Show Preview",
                    subtitle = "Show message content in notifications",
                    checked = showPreview,
                    onCheckedChange = {
                        showPreview = it
                        prefs.setBoolean(EncryptedPrefs.KEY_SHOW_PREVIEW, it)
                    },
                    enabled = notificationsEnabled
                )
            }

            // Devices Section
            SettingsSection(title = "Devices") {
                SettingsItem(
                    icon = Icons.Default.Devices,
                    title = "Linked Devices",
                    subtitle = "Manage connected devices",
                    onClick = { }
                )

                SettingsItem(
                    icon = Icons.Default.QrCode,
                    title = "Link New Device",
                    subtitle = "Connect another device",
                    onClick = { }
                )
            }

            // Data Section
            SettingsSection(title = "Data") {
                SettingsItem(
                    icon = Icons.Default.Download,
                    title = "Export Messages",
                    subtitle = "Save encrypted backup",
                    onClick = { }
                )

                SettingsItem(
                    icon = Icons.Default.DeleteForever,
                    title = "Clear Cache",
                    subtitle = "Free up storage space",
                    onClick = { }
                )
            }

            // About Section
            SettingsSection(title = "About") {
                SettingsItem(
                    icon = Icons.Default.Info,
                    title = "Version",
                    subtitle = "1.0.0",
                    onClick = { }
                )

                SettingsItem(
                    icon = Icons.Default.Policy,
                    title = "Privacy Policy",
                    subtitle = null,
                    onClick = { }
                )

                SettingsItem(
                    icon = Icons.Default.Code,
                    title = "Open Source Licenses",
                    subtitle = null,
                    onClick = { }
                )
            }
        }
    }
}

@Composable
fun SettingsSection(
    title: String,
    content: @Composable () -> Unit
) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )
        content()
        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
fun SettingsItem(
    icon: ImageVector,
    title: String,
    subtitle: String?,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge
                )
                subtitle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun SettingsSwitch(
    icon: ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onCheckedChange(!checked) }
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (enabled)
                    MaterialTheme.colorScheme.onSurfaceVariant
                else
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (enabled)
                        MaterialTheme.colorScheme.onSurface
                    else
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (enabled)
                        MaterialTheme.colorScheme.onSurfaceVariant
                    else
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )
            }

            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled
            )
        }
    }
}
