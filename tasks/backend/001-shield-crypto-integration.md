---
id: backend-001
title: "Shield Crypto Integration Layer"
status: todo
priority: high
tags: [crypto, shield, android, security]
dependencies: [setup-002]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 4h
complexity: 4
area: backend
---

# Shield Crypto Integration Layer

## Context
Implement the core encryption layer using Shield v1.1.0 for quantum-safe messaging with forward secrecy.

## Objectives
- Implement `ShieldCrypto.kt` as the main crypto interface
- Integrate RatchetSession for per-message forward secrecy
- Integrate StreamCipher for large file encryption
- Set up SecureKeyStore with Android Keystore backend

## Tasks
- [ ] Create `ShieldCrypto.kt` class with session management
- [ ] Implement `ChatSession` inner class with encrypt/decrypt
- [ ] Implement `MediaEncryption` inner class for files
- [ ] Create `KeyManager.kt` for Android Keystore integration
- [ ] Implement key generation and secure storage
- [ ] Add biometric authentication support via `BiometricAuth.kt`

## Technical Details

### ShieldCrypto API
```kotlin
class ShieldCrypto(context: Context) {
    fun getSession(contactId: String, isInitiator: Boolean): ChatSession
    fun generateSharedKey(contactId: String): ByteArray

    inner class ChatSession {
        fun encryptMessage(message: String): ByteArray
        fun decryptMessage(ciphertext: ByteArray): String
    }

    inner class MediaEncryption {
        suspend fun encryptFile(input: File, output: File)
        suspend fun decryptFile(input: File, output: File)
    }
}
```

### Security Parameters (from ArkAChat.md)
- Key derivation: PBKDF2-SHA256, 100,000 iterations
- Key size: 256 bits
- Nonce: 128 bits random per message
- MAC: HMAC-SHA256 (128-bit truncated)

## Acceptance Criteria
- [ ] Messages encrypt/decrypt correctly
- [ ] Keys stored in Android Keystore
- [ ] Forward secrecy verified (old keys can't decrypt new messages)
- [ ] File encryption works for images/videos
