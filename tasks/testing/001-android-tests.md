---
id: testing-001
title: "Android Unit & Integration Tests"
status: todo
priority: medium
tags: [testing, android, quality]
dependencies: [backend-001, backend-002, backend-003]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 4h
complexity: 3
area: testing
---

# Android Unit & Integration Tests

## Context
Create comprehensive test suite for Android app covering crypto, networking, and storage layers.

## Objectives
- Unit tests for ShieldCrypto operations
- Integration tests for SimpleX client
- Room database tests
- UI tests for critical flows

## Tasks
- [ ] Set up testing dependencies (JUnit, MockK, Turbine)
- [ ] Write `ShieldCryptoTest.kt` unit tests
- [ ] Write `SimpleXClientTest.kt` with mock server
- [ ] Write `ChatDatabaseTest.kt` Room tests
- [ ] Write `ChatViewModelTest.kt` with Turbine
- [ ] Create UI tests for chat flow
- [ ] Set up CI pipeline for tests

## Technical Details

### Test Structure
```
app/src/test/         # Unit tests
├── crypto/
│   └── ShieldCryptoTest.kt
├── network/
│   └── SimpleXClientTest.kt
└── viewmodel/
    └── ChatViewModelTest.kt

app/src/androidTest/  # Instrumented tests
├── storage/
│   └── ChatDatabaseTest.kt
└── ui/
    └── ChatScreenTest.kt
```

### ShieldCrypto Tests
```kotlin
class ShieldCryptoTest {
    @Test
    fun `encrypt and decrypt message preserves content`() {
        val crypto = ShieldCrypto(mockContext)
        val session = crypto.getSession("contact1", isInitiator = true)
        val message = "Hello, quantum-safe world!"

        val encrypted = session.encryptMessage(message)
        val decrypted = session.decryptMessage(encrypted)

        assertEquals(message, decrypted)
    }

    @Test
    fun `forward secrecy - old keys cannot decrypt new messages`() {
        // Test that ratcheting works
    }

    @Test
    fun `file encryption produces different output each time`() {
        // Nonce randomization test
    }
}
```

### ViewModel Tests with Turbine
```kotlin
class ChatViewModelTest {
    @Test
    fun `sending message updates state`() = runTest {
        val viewModel = ChatViewModel(...)

        viewModel.messages.test {
            viewModel.sendMessage("Hello")

            val messages = awaitItem()
            assertEquals(1, messages.size)
            assertEquals("Hello", messages[0].content)
        }
    }
}
```

## Acceptance Criteria
- [ ] >80% code coverage on crypto layer
- [ ] All unit tests pass
- [ ] Integration tests pass with mock server
- [ ] UI tests pass on emulator
- [ ] CI runs tests on every PR
