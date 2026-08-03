---
id: testing-002
title: "Cross-Platform Integration Tests"
status: todo
priority: high
tags: [testing, integration, cross-platform]
dependencies: [backend-006, api-003]
assignee: developer
created: 2026-01-20T18:00:00Z
estimate: 3h
complexity: 3
area: testing
---

# Cross-Platform Integration Tests

## Context
Verify that Shield encryption and SimpleX messaging work correctly across Android, Web, and Desktop platforms.

## Objectives
- Test encryption compatibility between platforms
- Test SimpleX message delivery between platforms
- Test QR pairing between different platforms
- Verify session state synchronization

## Tasks
- [ ] Create test vectors for Shield encryption
- [ ] Test Android → Web message encryption
- [ ] Test Web → Android message encryption
- [ ] Test Android ↔ Desktop message flow
- [ ] Test Web ↔ Desktop message flow
- [ ] Test QR pairing Android → Web
- [ ] Test QR pairing Web → Android
- [ ] Test session recovery after disconnect
- [ ] Test message ordering and replay protection

## Technical Details

### Test Vectors
```kotlin
// Known test vectors for cross-platform verification
object TestVectors {
    val sharedKey = "0123456789abcdef0123456789abcdef".toByteArray()
    val plaintext = "Hello, quantum-safe world!"

    // Expected ciphertext (first 32 bytes for verification)
    val expectedPrefix = byteArrayOf(/* ... */)
}
```

### Cross-Platform Test Script
```bash
#!/bin/bash
# Run from project root

# Start Android emulator
adb shell am start -n ai.dikestra.arkachat/.MainActivity

# Start Web app
cd arkachat-web && npm run dev &

# Run test suite
./gradlew :arkachat-android:connectedAndroidTest
cd arkachat-web && npm run test:e2e

# Verify message delivery
curl -X POST http://localhost:3000/api/test/send \
  -d '{"to": "android-emulator", "message": "test"}'
```

### Integration Test Cases
```kotlin
@Test
fun `Android encrypted message decrypts on Web`() {
    // 1. Create shared key
    // 2. Encrypt on Android with RatchetSession
    // 3. Send ciphertext to Web test endpoint
    // 4. Verify Web decrypts to same plaintext
}

@Test
fun `QR pairing establishes valid session`() {
    // 1. Generate QR on Android
    // 2. Scan QR on Web (simulated)
    // 3. Verify both have same shared key
    // 4. Exchange test messages
}
```

## Acceptance Criteria
- [ ] All test vectors pass on all platforms
- [ ] Android ↔ Web messages work bidirectionally
- [ ] QR pairing works across platforms
- [ ] No message loss under normal conditions
- [ ] Replay attacks are detected and rejected
