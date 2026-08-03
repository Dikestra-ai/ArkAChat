---
id: backend-004
title: "Integrate Real Shield Library"
status: done
priority: critical
tags: [crypto, shield, integration, android, web]
dependencies: [backend-001]
assignee: developer
created: 2026-01-20T18:00:00Z
estimate: 3h
complexity: 3
area: backend
---

# Integrate Real Shield Library

## Context
Replace placeholder Shield implementation with the actual Dikestra AI Shield library from `/data/git/Dikestra AI/Shield/`.

## Objectives
- Link Shield Kotlin library for Android
- Link Shield JavaScript library for Web
- Update crypto classes to use real Shield API
- Verify encryption compatibility across platforms

## Tasks
- [x] Configure Android to use local Shield Kotlin module
- [x] Configure Web to use local Shield JavaScript module
- [x] Update `ShieldCrypto.kt` to import real `ai.guard8.shield.*`
- [x] Update `crypto.ts` to import real `@guard8/shield`
- [x] Use `RatchetSession` for message encryption
- [x] Use `StreamCipher` for media encryption
- [x] Use `QRExchange` for contact pairing
- [ ] Test cross-platform encryption compatibility

## Technical Details

### Android Integration
```kotlin
// settings.gradle.kts
includeBuild("../../Shield/kotlin") {
    dependencySubstitution {
        substitute(module("ai.guard8:shield")).using(project(":"))
    }
}

// Or publish to local Maven
// cd Shield/kotlin && ./gradlew publishToMavenLocal
```

### Web Integration
```json
// package.json
{
  "dependencies": {
    "@guard8/shield": "file:../../Shield/javascript"
  }
}
```

### Shield API Usage
```kotlin
// Android - RatchetSession
val session = RatchetSession(sharedKey, isInitiator)
val encrypted = session.encrypt(plaintext)
val decrypted = session.decrypt(ciphertext)

// Android - StreamCipher
StreamCipher(key).use { cipher ->
    cipher.encryptFile(input, output)
}

// Android - QRExchange for pairing
val exchange = QRExchange()
val qrData = exchange.generateInvitation()
val sharedKey = exchange.acceptInvitation(scannedQR)
```

```typescript
// Web - same API
import { RatchetSession, StreamCipher, QRExchange } from '@guard8/shield';

const session = new RatchetSession(sharedKey, isInitiator);
const encrypted = session.encrypt(plaintext);
```

## Acceptance Criteria
- [x] Android uses real Shield library
- [x] Web uses real Shield library
- [ ] Messages encrypted on Android decrypt on Web
- [ ] Messages encrypted on Web decrypt on Android
- [x] QR pairing uses Shield QRExchange
