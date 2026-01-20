---
id: testing-003
title: "Shield Encryption Compatibility Tests"
status: done
priority: critical
tags: [testing, encryption, shield, cross-platform]
dependencies: [backend-004, backend-005]
assignee: developer
created: 2026-01-20T20:00:00Z
estimate: 2h
complexity: 2
area: testing
---

# Shield Encryption Compatibility Tests

## Context
Verify that Shield encryption produces identical results across Android (Kotlin) and Web (TypeScript/Browser) platforms.

## Objectives
- Create test vectors for Shield RatchetSession
- Verify Android encrypted messages decrypt on Web
- Verify Web encrypted messages decrypt on Android
- Test QRExchange data format compatibility

## Tasks
- [ ] Create shared test vectors file (JSON)
- [ ] Write Android unit tests for test vectors
- [ ] Write Web unit tests for test vectors
- [ ] Test RatchetSession cross-platform
- [ ] Test QRExchange encoding/decoding
- [ ] Test encrypted file format compatibility

## Technical Details

### Test Vectors (tests/vectors/shield-test-vectors.json)
```json
{
  "ratchetSession": {
    "rootKey": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "messages": [
      {
        "plaintext": "Hello, quantum-safe world!",
        "initiatorCiphertext": "base64...",
        "responderCiphertext": "base64..."
      }
    ]
  },
  "qrExchange": {
    "key": "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    "metadata": {"name": "Alice", "ts": 1705780000000},
    "encoded": "{\"v\":1,\"k\":\"...\",\"m\":{...}}"
  },
  "quickEncrypt": {
    "key": "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
    "plaintext": "Test message for quick encrypt",
    "nonce": "000102030405060708090a0b",
    "ciphertext": "base64..."
  }
}
```

### Android Test (ShieldCompatibilityTest.kt)
```kotlin
@Test
fun `RatchetSession produces expected ciphertext`() {
    val vectors = loadTestVectors()
    val rootKey = vectors.ratchetSession.rootKey.hexToByteArray()

    val session = RatchetSession(rootKey, isInitiator = true)
    val ciphertext = session.encrypt(vectors.messages[0].plaintext.toByteArray())

    // Verify structure (nonce + ciphertext + mac)
    assertTrue(ciphertext.size >= 40)
}

@Test
fun `Web ciphertext decrypts on Android`() {
    val vectors = loadTestVectors()
    val rootKey = vectors.ratchetSession.rootKey.hexToByteArray()

    // Simulate receiving from Web (responder)
    val session = RatchetSession(rootKey, isInitiator = true)
    val webCiphertext = vectors.messages[0].responderCiphertext.base64Decode()

    val plaintext = session.decrypt(webCiphertext)
    assertEquals(vectors.messages[0].plaintext, String(plaintext))
}
```

### Web Test (shield-compatibility.test.ts)
```typescript
test('RatchetSession produces expected ciphertext', async () => {
    const vectors = await loadTestVectors();
    const rootKey = hexToBytes(vectors.ratchetSession.rootKey);

    const session = await RatchetSession.create(rootKey, true);
    const plaintext = new TextEncoder().encode(vectors.messages[0].plaintext);
    const ciphertext = await session.encrypt(plaintext);

    // Verify structure
    expect(ciphertext.length).toBeGreaterThanOrEqual(40);
});

test('Android ciphertext decrypts on Web', async () => {
    const vectors = await loadTestVectors();
    const rootKey = hexToBytes(vectors.ratchetSession.rootKey);

    // Simulate receiving from Android (initiator)
    const session = await RatchetSession.create(rootKey, false);
    const androidCiphertext = base64ToBytes(vectors.messages[0].initiatorCiphertext);

    const plaintext = await session.decrypt(androidCiphertext);
    expect(new TextDecoder().decode(plaintext)).toBe(vectors.messages[0].plaintext);
});
```

### Run Tests
```bash
# Android
./gradlew :chatguard-android:app:testDebugUnitTest --tests "*ShieldCompatibility*"

# Web
cd chatguard-web && npm test -- --grep "shield-compatibility"
```

## Acceptance Criteria
- [ ] All test vectors pass on both platforms
- [ ] Messages encrypted on Android decrypt on Web
- [ ] Messages encrypted on Web decrypt on Android
- [ ] QRExchange format identical across platforms
- [ ] Encrypted file format identical across platforms
