# ChatGuard: Shield + SimpleX Integration Architecture

> **Quantum-safe WhatsApp alternative with zero metadata collection**
> Built on SimpleX Chat protocol + Guard8.ai Shield encryption

**Version:** 1.0.0
**Last Updated:** January 2026
**Status:** Implementation In Progress (57% Complete)
**Location:** `/data/git/Guard8.ai/ChatGuard`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Implementation Status](#implementation-status)
3. [High-Level Architecture](#high-level-architecture)
4. [Group Chat Protocol](#group-chat-protocol)
5. [Android Integration (Priority #1)](#android-integration-priority-1)
6. [Web/Desktop Integration (Priority #2)](#webdesktop-integration-priority-2)
7. [Cross-Platform Sync](#cross-platform-sync)
8. [Security Architecture](#security-architecture)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Performance Benchmarks](#performance-benchmarks)
11. [Deployment Strategy](#deployment-strategy)

---

## Executive Summary

**ChatGuard** is a quantum-resistant messaging application combining:
- **SimpleX Chat**: Zero-identifier messaging protocol (no phone numbers, no metadata)
- **Guard8.ai Shield v1.1.0**: EXPTIME-secure encryption (survives quantum computers + P=NP proofs)

### Shield v1.1.0 Features Used

| Feature | Description | ChatGuard Usage |
|---------|-------------|-----------------|
| `RatchetSession` | Forward secrecy with key ratcheting | Per-message encryption |
| `StreamCipher` | Large file encryption (~160 MB/s) | Images, videos, voice |
| `quickEncrypt` | Fast symmetric encryption | Metadata encryption |
| `SecureKeyStore` | Hardware-backed storage (Android/iOS) | Key protection |
| `TOTP` | Time-based OTP | Optional 2FA |
| `confidential` | TEE attestation (v1.1.0) | Server-side key release |

### Why ChatGuard?

| Feature | WhatsApp | Signal | SimpleX | **ChatGuard** |
|---------|----------|--------|---------|--------------|
| No phone number | ❌ | ❌ | ✅ | ✅ |
| No metadata | ❌ | ⚠️ | ✅ | ✅ |
| Quantum-safe | ❌ | ❌ | ❌ | ✅ 256-bit symmetric |
| P=NP resistant | ❌ | ❌ | ❌ | ✅ EXPTIME-hard |
| Open source | ❌ | ✅ | ✅ | ✅ |
| Images/videos | ✅ | ✅ | ✅ | ✅ |
| Desktop apps | ✅ | ✅ | ✅ | ✅ |
| Web version | ✅ | ❌ | ❌ | ✅ (with Shield WASM) |
| TEE support | ❌ | ❌ | ❌ | ✅ (Shield v1.1.0) |

### Key Advantages

1. **No identifiers**: Not even random IDs - pure pairwise connections
2. **Quantum resistance**: 256-bit symmetric encryption (2^256 brute force)
3. **Hardware security**: Android Keystore/TEE integration
4. **Cross-platform**: Android, Web, Linux, macOS, Windows
5. **Rich media**: Encrypted images, videos, files, voice messages
6. **Forward secrecy**: Shield RatchetSession with message counters
7. **Confidential Computing**: TEE-backed key management (AWS Nitro, GCP SEV, Azure MAA, Intel SGX)

---

## Implementation Status

### Current Progress (January 2026)

| Category | Status | Progress |
|----------|--------|----------|
| **Setup** | Android + Web complete | 75% (3/4) |
| **Backend** | Core features done | 67% (6/9) |
| **Frontend** | Main UI complete | 56% (5/9) |
| **Testing** | Unit + Integration tests | 57% (4/7) |
| **Auth/Sync** | Not started | 0% (0/2) |

### Feature Completion Matrix

| Feature | Android | Web | Desktop |
|---------|---------|-----|---------|
| 1:1 Messaging | ✅ Done | ✅ Done | ❌ TODO |
| Group Chat | ✅ Done | ✅ Done | ❌ TODO |
| File Encryption | ✅ Done | ✅ Done | ❌ TODO |
| QR Contact Pairing | ✅ Done | ✅ Done | ❌ TODO |
| Forward Secrecy | ✅ Done | ✅ Done | ❌ TODO |
| Local Notifications | ✅ Done | ⚠️ Partial | ❌ TODO |
| Push Notifications | ❌ TODO | ❌ TODO | ❌ TODO |
| Multi-Device Sync | ❌ TODO | ❌ TODO | ❌ TODO |
| Read Receipts | ⚠️ Partial | ⚠️ Partial | ❌ TODO |

### What's Fully Operational

1. **End-to-end encryption** with Shield RatchetSession (forward secrecy)
2. **Group messaging** with key rotation and admin controls
3. **Encrypted file storage** with streaming encryption (~160 MB/s)
4. **QR-based contact pairing** with secure key exchange
5. **Android and Web UI** for 1:1 and group chats
6. **Message persistence** in encrypted databases

### What's In Progress

1. ⚠️ Read receipts (UI exists, backend TODO)
2. ⚠️ Attachment picker (Android TODO comment)
3. ⚠️ Desktop Electron app (scaffolding only)

### What's Not Started

1. ❌ Cross-device sync and multi-device linking
2. ❌ Remote push notifications (FCM/APNs)
3. ❌ Full desktop app implementation

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ChatGuard Stack                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │ Android App   │  │  Web App      │  │ Desktop App   │      │
│  │ (Kotlin)      │  │ (React/Next)  │  │ (Electron)    │      │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤      │
│  │ Jetpack       │  │ Tailwind CSS  │  │ React         │      │
│  │ Compose       │  │ shadcn/ui     │  │ TypeScript    │      │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤      │
│  │ Shield        │  │ @guard8/      │  │ @guard8/      │      │
│  │ Android SDK   │  │ shield-wasm   │  │ shield        │      │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤      │
│  │ Android       │  │ IndexedDB     │  │ OS Keychain   │      │
│  │ Keystore/TEE  │  │ (encrypted)   │  │ (secure)      │      │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│              Shield Crypto Layer v1.1.0 (Unified)               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • RatchetSession (forward secrecy, per-message keys)    │   │
│  │ • StreamCipher (large file encryption, ~160 MB/s)       │   │
│  │ • quickEncrypt (fast symmetric encryption)              │   │
│  │ • SymmetricSignature (HMAC-SHA256 authenticity)         │   │
│  │ • TOTP (optional 2FA for additional security)           │   │
│  │ • SecureKeyStore (hardware-backed key storage)          │   │
│  │ • TEEKeyManager (attestation-gated keys) [NEW v1.1.0]   │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│              SimpleX Messaging Protocol (SMP)                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Ephemeral message queues (deleted after delivery)     │   │
│  │ • No user identifiers (pairwise queue IDs only)         │   │
│  │ • WebSocket transport (works on cellular)               │   │
│  │ • Self-hostable servers (no vendor lock-in)             │   │
│  │ • Push notifications (encrypted metadata only)          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Architecture

```
1. Message Creation
   ├── User types message in UI
   ├── App generates unique message ID
   └── Prepare for encryption

2. Encryption (Shield Layer)
   ├── Retrieve session key from secure storage
   ├── RatchetSession.encrypt(message) → forward secrecy
   ├── Add HMAC signature for authenticity
   └── Encrypted payload ready

3. Transport (SimpleX Layer)
   ├── Send to recipient's message queue (via WebSocket)
   ├── Server holds encrypted message temporarily
   ├── Recipient fetches message
   └── Server deletes message after delivery

4. Decryption (Shield Layer)
   ├── Verify HMAC signature
   ├── RatchetSession.decrypt(ciphertext)
   └── Display plaintext message

5. Media Files (Images/Videos)
   ├── StreamCipher.encryptFile(input, output)
   ├── Upload encrypted file to SimpleX file server
   ├── Send file URL + key in encrypted message
   └── Recipient downloads + decrypts
```

---

## Group Chat Protocol

### Overview

Group chat uses a **symmetric key distribution** model where:
- Group creator generates a random 32-byte group key
- Key is encrypted per-member using their pairwise Shield session
- Each member receives their encrypted key via SimpleX
- Key rotates automatically when members are removed (forward secrecy)

### Group Key Distribution Flow

```
1. Group Creation
   ├── Admin creates group with name and members
   ├── Generate random 32-byte group key
   ├── Generate unique keyId (UUID)
   └── Store key locally encrypted with master key

2. Key Distribution (for each member)
   ├── Encrypt group key with member's pairwise session
   ├── Send GROUP_KEY:groupId:keyId:base64_encrypted via SimpleX
   └── Member stores received key

3. Group Messaging
   ├── Sender: Shield.quickEncrypt(groupKey, messageBytes)
   ├── Format: GROUP:groupId:keyId:base64_ciphertext
   ├── Send to all members via their SimpleX queues
   └── Recipients: Lookup key by keyId, decrypt message

4. Member Removal (Key Rotation)
   ├── Remove member from group
   ├── Generate NEW group key
   ├── Distribute new key to remaining members
   └── Old key kept for decrypting historical messages
```

### Group Message Envelope

```typescript
interface GroupMessageEnvelope {
  type: GroupMessageType;   // TEXT, FILE, MEMBER_ADDED, MEMBER_REMOVED, KEY_ROTATION, etc.
  groupId: string;
  senderId: string;         // Contact ID of sender
  messageId: string;
  timestamp: number;
  keyId: string;            // Which group key version
  content?: string;         // For TEXT messages
  fileId?: string;          // For FILE messages
  replyToId?: string;       // For receipts
  metadata?: Record<string, string>;  // Additional data
}

enum GroupMessageType {
  TEXT,
  FILE,
  MEMBER_ADDED,
  MEMBER_REMOVED,
  KEY_ROTATION,
  GROUP_INFO_UPDATE,
  ADMIN_CHANGE,
  DELIVERY_RECEIPT,
  READ_RECEIPT
}
```

### Member Roles & Permissions

| Action | Admin | Member |
|--------|-------|--------|
| Send messages | ✅ | ✅ |
| Add members | ✅ | ❌ |
| Remove members | ✅ | ❌ |
| Change group name | ✅ | ❌ |
| Promote to admin | ✅ | ❌ |
| Demote admin | ✅ | ❌ |
| Leave group | ✅ | ✅ |

### Implementation Files

**Android:**
- `model/Group.kt` - Data models (Group, GroupMember, GroupKey, GroupMessageEnvelope)
- `crypto/GroupKeyManager.kt` - Key generation, rotation, distribution
- `storage/GroupDao.kt` - Database operations
- `bridge/ShieldSimplexBridge.kt` - Message handling

**Web:**
- `lib/storage/groupStore.ts` - Zustand store for groups
- `lib/crypto/groupKeyManager.ts` - Key management
- `lib/bridge/shieldSimplexBridge.ts` - Message handling
- `components/GroupChatWindow.tsx` - UI component

---

## Android Integration (Priority #1)

### Architecture Overview

```
chatguard-android/
├── app/
│   ├── src/main/java/ai/guard8/chatguard/
│   │   ├── ui/                         ✅ 10 Compose screens
│   │   │   ├── ChatScreen.kt           (1:1 chat interface)
│   │   │   ├── GroupChatScreen.kt      (Group messaging)
│   │   │   ├── GroupListScreen.kt      (Groups overview)
│   │   │   ├── CreateGroupScreen.kt    (Group creation)
│   │   │   ├── GroupSettingsScreen.kt  (Member management)
│   │   │   ├── ContactsScreen.kt       (Contact list)
│   │   │   ├── NewContactScreen.kt     (Add contact)
│   │   │   ├── QRDisplayScreen.kt      (Show QR for pairing)
│   │   │   ├── QRScannerScreen.kt      (Scan contact QR)
│   │   │   ├── SettingsScreen.kt       (App settings)
│   │   │   └── Navigation.kt           (Nav structure)
│   │   ├── viewmodel/
│   │   │   ├── ChatViewModel.kt        (Chat state/logic)
│   │   │   ├── ContactsViewModel.kt    (Contacts management)
│   │   │   ├── GroupViewModel.kt       (Group state)
│   │   │   └── GroupListViewModel.kt   (Group list)
│   │   ├── model/
│   │   │   ├── Message.kt              (Message entity)
│   │   │   ├── Contact.kt              (Contact entity)
│   │   │   ├── Group.kt                (Group + Member + Key entities)
│   │   │   └── MediaFile.kt            (File metadata)
│   │   ├── crypto/                     ✅ Shield v1.1.0
│   │   │   ├── ShieldCrypto.kt         (RatchetSession encryption)
│   │   │   ├── GroupKeyManager.kt      (Group key rotation)
│   │   │   ├── KeyManager.kt           (Android Keystore)
│   │   │   └── BiometricAuth.kt        (Fingerprint/Face)
│   │   ├── bridge/
│   │   │   └── ShieldSimplexBridge.kt  ⭐ Shield + SimpleX integration
│   │   ├── network/
│   │   │   ├── SimpleXClient.kt        (WebSocket connection)
│   │   │   └── MessageSyncService.kt   (Background sync)
│   │   ├── storage/
│   │   │   ├── ChatDatabase.kt         (Room database)
│   │   │   ├── MessageDao.kt           (Message persistence)
│   │   │   ├── ContactDao.kt           (Contact persistence)
│   │   │   ├── GroupDao.kt             (Group persistence)
│   │   │   ├── EncryptedFileStorage.kt (Streaming file encryption)
│   │   │   └── EncryptedPrefs.kt       (Settings storage)
│   │   ├── ChatGuardApp.kt             (Application class)
│   │   └── MainActivity.kt             (Entry point)
│   ├── src/test/                       ✅ Unit tests
│   │   └── java/.../crypto/
│   │       ├── GroupKeyManagerTest.kt
│   │       ├── GroupMessageEnvelopeTest.kt
│   │       ├── GroupPermissionTest.kt
│   │       └── ShieldCompatibilityTest.kt
│   └── src/androidTest/                ✅ Instrumentation tests
│       └── java/.../ui/
│           ├── ChatScreenTest.kt
│           ├── ContactsScreenTest.kt
│           └── GroupChatScreenTest.kt
└── build.gradle.kts
```

### 1. Build Configuration

**File:** `app/build.gradle.kts`

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.kapt")
}

android {
    namespace = "ai.guard8.chatguard"
    compileSdk = 34

    defaultConfig {
        applicationId = "ai.guard8.chatguard"
        minSdk = 26  // Android 8.0 (for Keystore features)
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
}

dependencies {
    // Shield Android SDK v1.1.0
    implementation("ai.guard8:shield-android:1.1.0")

    // Jetpack Compose
    implementation(platform("androidx.compose:compose-bom:2024.01.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")

    // Coil for image loading
    implementation("io.coil-kt:coil-compose:2.5.0")

    // Room database
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")

    // WebSocket (OkHttp)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Biometric authentication
    implementation("androidx.biometric:biometric:1.2.0-alpha05")

    // Security crypto
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
```

### 2. Shield Crypto Integration

**File:** `app/src/main/java/ai/guard8/chatguard/crypto/ShieldCrypto.kt`

```kotlin
package ai.guard8.chatguard.crypto

import ai.guard8.shield.Shield
import ai.guard8.shield.RatchetSession
import ai.guard8.shield.StreamCipher
import ai.guard8.shield.SecureKeyStore
import android.content.Context
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * ChatGuard encryption layer using Shield v1.1.0
 * Provides quantum-safe encryption for all messages and media
 */
class ShieldCrypto(private val context: Context) {

    private val keyStore = SecureKeyStore(context)
    private val sessions = ConcurrentHashMap<String, RatchetSession>()

    /**
     * Text message encryption with forward secrecy
     */
    inner class ChatSession(
        private val contactId: String,
        private val isInitiator: Boolean
    ) {
        private val session: RatchetSession by lazy {
            val sharedKey = keyStore.retrieve("shared_key_$contactId")
            RatchetSession(sharedKey, isInitiator)
        }

        fun encryptMessage(message: String): ByteArray {
            return session.encrypt(message.toByteArray())
        }

        fun decryptMessage(ciphertext: ByteArray): String {
            val decrypted = session.decrypt(ciphertext)
            return String(decrypted)
        }
    }

    /**
     * Large file encryption for images/videos
     */
    inner class MediaEncryption(private val contactId: String) {
        private val key: ByteArray by lazy {
            keyStore.retrieve("media_key_$contactId")
        }

        suspend fun encryptFile(inputFile: File, outputFile: File) {
            StreamCipher(key).use { cipher ->
                cipher.encryptFile(inputFile, outputFile)
            }
        }

        suspend fun decryptFile(inputFile: File, outputFile: File) {
            StreamCipher(key).use { cipher ->
                cipher.decryptFile(inputFile, outputFile)
            }
        }
    }

    fun getSession(contactId: String, isInitiator: Boolean): ChatSession {
        return ChatSession(contactId, isInitiator)
    }

    fun generateSharedKey(contactId: String): ByteArray {
        val key = Shield.generateKey()
        keyStore.store("shared_key_$contactId", key, requireBiometric = false)
        keyStore.store("media_key_$contactId", Shield.generateKey(), requireBiometric = false)
        return key
    }
}
```

### 3. Chat UI (Jetpack Compose)

**File:** `app/src/main/java/ai/guard8/chatguard/ui/ChatScreen.kt`

```kotlin
package ai.guard8.chatguard.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    contactName: String,
    messages: List<Message>,
    onSendMessage: (String) -> Unit,
    onSendImage: () -> Unit
) {
    var messageText by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(contactName) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary
                ),
                actions = {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = "Quantum-safe",
                        tint = Color.Green,
                        modifier = Modifier.padding(end = 16.dp)
                    )
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            reverseLayout = true
        ) {
            items(messages) { message ->
                MessageBubble(message)
            }
        }
    }
}

@Composable
fun MessageBubble(message: Message) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        horizontalArrangement = if (message.isSent)
            Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = if (message.isSent)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.secondaryContainer,
            tonalElevation = 2.dp
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyLarge
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = message.timestamp.format(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
```

---

## Web/Desktop Integration (Priority #2)

### Web App Architecture

```
chatguard-web/
├── src/
│   ├── app/
│   │   ├── page.tsx                    (Landing page)
│   │   ├── chat/page.tsx               (Chat interface)
│   │   └── layout.tsx                  (App layout)
│   ├── components/                     ✅ Full UI library
│   │   ├── ChatWindow.tsx              (1:1 chat)
│   │   ├── GroupChatWindow.tsx         (Group messaging)
│   │   ├── GroupList.tsx               (Groups overview)
│   │   ├── CreateGroupModal.tsx        (Group creation)
│   │   ├── GroupSettingsModal.tsx      (Member management)
│   │   ├── MessageBubble.tsx           (1:1 messages)
│   │   ├── GroupMessageBubble.tsx      (Group messages)
│   │   ├── ContactList.tsx             (Contact list)
│   │   ├── AddContactModal.tsx         (Add contact)
│   │   ├── QRGenerator.tsx             (QR code display)
│   │   └── QRScanner.tsx               (QR code scanning)
│   ├── hooks/
│   │   ├── useGroupChat.ts             (Group chat logic)
│   │   └── useChatBridge.ts            (Bridge integration)
│   ├── lib/
│   │   ├── shield/
│   │   │   └── crypto.ts               ⭐ Shield WASM (581 lines)
│   │   ├── crypto/
│   │   │   └── groupKeyManager.ts      (Group key management)
│   │   ├── bridge/
│   │   │   └── shieldSimplexBridge.ts  ⭐ Shield + SimpleX integration
│   │   ├── simplex/
│   │   │   └── client.ts               (WebSocket connection)
│   │   └── storage/
│   │       ├── chatStore.ts            (Zustand - messages)
│   │       ├── groupStore.ts           (Zustand - groups)
│   │       └── encryptedFileStorage.ts (IndexedDB encryption)
│   └── styles/
│       └── globals.css
├── src/__tests__/                      ✅ Unit tests
│   ├── groupKeyManager.test.ts
│   └── groupStore.test.ts
├── package.json
└── tsconfig.json
```

### Shield WASM Integration

**File:** `src/lib/shield/crypto.ts`

```typescript
import { ShieldBrowser } from '@guard8/shield-browser';

export class WebShieldCrypto {
  private shield: ShieldBrowser;
  private sessions = new Map<string, RatchetSession>();

  constructor() {
    this.shield = new ShieldBrowser();
  }

  async initialize(): Promise<void> {
    await this.shield.init();
  }

  class ChatSession {
    private session: RatchetSession;

    constructor(contactId: string, isInitiator: boolean) {
      const sharedKey = await this.getKey(`shared_key_${contactId}`);
      this.session = new RatchetSession(sharedKey, isInitiator);
    }

    async encryptMessage(message: string): Promise<Uint8Array> {
      return this.session.encrypt(new TextEncoder().encode(message));
    }

    async decryptMessage(ciphertext: Uint8Array): Promise<string> {
      const decrypted = this.session.decrypt(ciphertext);
      return new TextDecoder().decode(decrypted);
    }
  }

  async generateSharedKey(contactId: string): Promise<Uint8Array> {
    const key = this.shield.generateKey();
    await this.storeKey(`shared_key_${contactId}`, key);
    return key;
  }

  private async storeKey(keyId: string, key: Uint8Array): Promise<void> {
    const encrypted = await this.shield.encrypt(
      key,
      await this.getUserPassword(),
      'chatguard'
    );

    const db = await openDB('chatguard-keys', 1);
    await db.put('keys', encrypted, keyId);
  }
}
```

### Chat UI (React)

**File:** `src/components/ChatWindow.tsx`

```typescript
'use client';

import React, { useState } from 'react';
import { Send, Shield } from 'lucide-react';
import { WebShieldCrypto } from '@/lib/shield/crypto';

export default function ChatWindow({ contactId, contactName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [crypto] = useState(() => new WebShieldCrypto());

  async function sendMessage() {
    if (!inputText.trim()) return;

    const session = crypto.ChatSession(contactId, true);
    const encrypted = await session.encryptMessage(inputText);

    await client.sendMessage(contactId, encrypted);

    setMessages([...messages, {
      id: generateId(),
      content: inputText,
      isSent: true,
      timestamp: Date.now()
    }]);

    setInputText('');
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="bg-blue-600 text-white p-4 flex justify-between">
        <h1 className="text-xl font-semibold">{contactName}</h1>
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-green-400" />
          <span className="text-sm">Quantum-safe</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      <div className="bg-white border-t p-4 flex space-x-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          className="flex-1 border rounded-full px-4 py-2"
          placeholder="Message..."
        />
        <button
          onClick={sendMessage}
          className="bg-blue-600 text-white p-2 rounded-full"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
```

---

## Cross-Platform Sync

> ⚠️ **Status: NOT YET IMPLEMENTED** (Tasks: auth-001, auth-002)

### What's Implemented: Contact Pairing via QR

Currently, contacts can be paired via QR codes:

```
1. User A displays QR code containing:
   - SimpleX queue URI
   - Shield public key
   - Display name
   - Timestamp

2. User B scans QR code and establishes:
   - Pairwise SimpleX connection
   - Shared Shield encryption key
   - Contact entry in local database

3. Both users can now exchange encrypted messages
```

**Implemented in:**
- Android: `QRDisplayScreen.kt`, `QRScannerScreen.kt`
- Web: `QRGenerator.tsx`, `QRScanner.tsx`

### What's NOT Implemented: Multi-Device Sync

The following features are planned but not yet built:

```typescript
// PLANNED - NOT IMPLEMENTED
class DevicePairing {
  async generatePairingQR(): Promise<string> {
    const pairingKey = crypto.generateKey();
    await keychain.store('pairing_key', pairingKey);

    return encodeQR({
      version: 'chatguard-sync-1.0',
      pairingKey: base64(pairingKey),
      deviceId: getDeviceId(),
      timestamp: Date.now()
    });
  }

  async acceptPairing(qrData: string) {
    const { pairingKey, deviceId } = decodeQR(qrData);
    await keychain.store(`paired_device_${deviceId}`, pairingKey);
    await syncMessages(deviceId);
  }
}
```

### Planned Multi-Device Features

| Feature | Status | Description |
|---------|--------|-------------|
| Device linking | ❌ TODO | Link multiple devices to same account |
| Message sync | ❌ TODO | Sync messages across linked devices |
| Contact migration | ❌ TODO | Transfer contacts to new device |
| Key backup | ❌ TODO | Encrypted key backup/restore |

---

## Security Architecture

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Quantum computers | 256-bit symmetric encryption |
| P=NP proof | EXPTIME-hard crypto |
| Server compromise | E2E encryption, ephemeral queues |
| MITM | QR key exchange |
| Metadata | No identifiers |
| Device theft | Hardware keystore + biometric |
| Compromised server keys | TEE attestation (Shield v1.1.0) |

### Shield v1.1.0 Security Parameters

| Parameter | Value |
|-----------|-------|
| Key derivation | PBKDF2-SHA256, 100,000 iterations |
| Key size | 256 bits |
| Nonce | 128 bits (random per message) |
| MAC | HMAC-SHA256 (128-bit truncated) |
| TEE Support | AWS Nitro, GCP SEV, Azure MAA, Intel SGX |

---

## Implementation Roadmap

### Phase 1: Android MVP ✅ COMPLETE
- ✅ Core setup + Shield v1.1.0 integration
- ✅ UI + messaging (Jetpack Compose)
- ✅ Media encryption (StreamCipher)
- ✅ Group chat support
- ✅ QR contact pairing
- ✅ Unit + instrumentation tests

### Phase 2: Web App ✅ COMPLETE
- ✅ Next.js + Shield WASM
- ✅ Chat UI + features
- ✅ Group chat support
- ✅ Encrypted file storage
- ✅ Zustand state management

### Phase 3: Desktop 🔄 IN PROGRESS
- ⚠️ Electron wrapper (scaffolding only)
- ❌ OS keychain integration
- ❌ Build for all platforms

### Phase 4: Cross-Platform Sync ❌ NOT STARTED
- ❌ Device pairing protocol
- ❌ Multi-device message sync
- ❌ Contact migration

### Phase 5: Polish ❌ NOT STARTED
- ❌ Remote push notifications
- ❌ Read receipts (backend)
- ❌ Performance optimization
- ❌ Security audit

### Remaining Tasks

| Task ID | Description | Priority |
|---------|-------------|----------|
| setup-004 | Desktop Electron setup | Medium |
| auth-001 | Device pairing protocol | High |
| auth-002 | Multi-device sync | High |
| testing-005 | Cross-platform tests | Medium |
| testing-006 | Integration tests | Medium |

---

## Performance Benchmarks

| Operation | Shield v1.1.0 | Notes |
|-----------|---------------|-------|
| Text encryption | <1ms | Per message |
| File (10MB) | ~63ms | StreamCipher |
| Message latency | ~100ms | Network |
| Key derivation | ~250ms | PBKDF2 100k iterations |

---

## Deployment

### Android
```bash
./gradlew assembleRelease
# Deploy to Play Store / F-Droid
```

### Web
```bash
npm run build
# Deploy to Vercel/Cloudflare
```

### Desktop
```bash
npm run build:linux
npm run build:mac
npm run build:windows
```

---

## Related Projects

- **Shield**: `/data/git/Guard8.ai/Shield` - Core encryption library (v1.1.0)
- **DOMGuard**: `/data/git/Guard8.ai/DOMGuard` - Browser security
- **TaskGuard**: `/data/git/Guard8.ai/TaskGuard` - Task management

## Shield Resources

- **crates.io**: `shield-core = "1.1"` (with `confidential` feature for TEE)
- **npm**: `@guard8/shield`, `@guard8/shield-browser`
- **PyPI**: `shield-crypto`
- **GitHub**: https://github.com/Guard8-ai/Shield

---

## License

MIT License

---

## Next Steps

### High Priority

1. **Multi-Device Sync (auth-001, auth-002)**
   - Implement device pairing protocol
   - Build sync channel encryption
   - Enable contact/message migration

2. **Remote Push Notifications**
   - Add FCM (Android) / APNs (iOS) support
   - Implement notification server
   - Encrypt push payload metadata

3. **Read Receipts**
   - Complete backend implementation
   - Wire up UI indicators

### Medium Priority

4. **Desktop App (setup-004)**
   - Complete Electron integration
   - Implement OS keychain storage
   - Build for Windows/macOS/Linux

5. **Cross-Platform Tests (testing-005, testing-006)**
   - Android ↔ Web message compatibility
   - Group key distribution across platforms

### Code Quality

6. **TODOs to Address**
   - `ChatViewModel.kt:106` - Send read receipts
   - `GroupKeyManager.kt:211` - Get isInitiator from contact
   - `ChatScreen.kt:110` - Attachment picker
   - `useChatBridge.ts:157` - Send read receipts via bridge

---

## Key Files Reference

| Purpose | Android | Web |
|---------|---------|-----|
| Shield Integration | `ShieldCrypto.kt` | `lib/shield/crypto.ts` |
| Bridge | `ShieldSimplexBridge.kt` | `lib/bridge/shieldSimplexBridge.ts` |
| Group Keys | `GroupKeyManager.kt` | `lib/crypto/groupKeyManager.ts` |
| File Encryption | `EncryptedFileStorage.kt` | `lib/storage/encryptedFileStorage.ts` |
| Message Store | `MessageDao.kt` | `lib/storage/chatStore.ts` |
| Group Store | `GroupDao.kt` | `lib/storage/groupStore.ts` |

---

**ChatGuard** - Quantum-safe messaging for everyone.

Built by Guard8.ai with ❤️
