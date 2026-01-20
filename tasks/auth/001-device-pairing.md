---
id: auth-001
title: "Device Pairing & Cross-Platform Sync"
status: todo
priority: medium
tags: [auth, sync, qr, security]
dependencies: [backend-001, api-001]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 5h
complexity: 5
area: auth
---

# Device Pairing & Cross-Platform Sync

## Context
Implement secure device pairing via QR codes and cross-platform message sync as defined in ChatGuard.md.

## Objectives
- QR-based device pairing protocol
- Encrypted sync channel between devices
- Contact/key migration between platforms
- Multi-device message delivery

## Tasks
- [ ] Design pairing protocol with key exchange
- [ ] Implement `DevicePairing.kt` for Android
- [ ] Implement `devicePairing.ts` for Web
- [ ] Create QR code generation/scanning
- [ ] Implement encrypted sync protocol
- [ ] Handle conflict resolution
- [ ] Add device management UI

## Technical Details

### Pairing Protocol
```
1. Device A generates pairing QR:
   {
     version: "chatguard-sync-1.0",
     pairingKey: base64(randomKey),
     deviceId: uuid(),
     timestamp: epochMs,
     signature: sign(pairingKey + deviceId + timestamp)
   }

2. Device B scans QR:
   - Validates timestamp (< 5 minutes)
   - Stores pairing key
   - Generates response QR with own deviceId

3. Device A scans response:
   - Verifies signature
   - Establishes encrypted channel
   - Begins sync

4. Sync Protocol:
   - Contacts synced via encrypted messages
   - Keys never transmitted (re-derived on each device)
   - Messages synced from server queues
```

### DevicePairing API
```kotlin
class DevicePairing(
    private val crypto: ShieldCrypto,
    private val simplex: SimpleXClient
) {
    suspend fun generatePairingQR(): String
    suspend fun acceptPairing(qrData: String): PairingResult
    suspend fun completePairing(responseQR: String): PairingResult

    suspend fun syncContacts(deviceId: String)
    suspend fun listLinkedDevices(): List<LinkedDevice>
    suspend fun unlinkDevice(deviceId: String)
}

data class LinkedDevice(
    val deviceId: String,
    val name: String,
    val platform: Platform,
    val linkedAt: Long,
    val lastSeen: Long
)
```

### Security Considerations
- Pairing QR expires after 5 minutes
- Keys derived independently on each device
- No private keys transmitted
- Device can be unlinked remotely

## Acceptance Criteria
- [ ] QR pairing works Android ↔ Web
- [ ] Contacts sync correctly
- [ ] Messages appear on all devices
- [ ] Device can be unlinked
- [ ] Expired QR codes rejected
