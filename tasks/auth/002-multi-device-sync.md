---
id: auth-002
title: "Multi-Device Sync and Pairing"
status: todo
priority: medium
tags: [auth, sync, multi-device, backup]
dependencies: [backend-008]
assignee: developer
created: 2026-01-20T21:00:00Z
estimate: 6h
complexity: 4
area: auth
---

# Multi-Device Sync and Pairing

## Context
Allow users to use ArkAChat on multiple devices (Android + Web) with synchronized contacts and message history.

## Objectives
- QR-based device pairing for same account
- Secure key synchronization between devices
- Message history sync
- Contact list sync

## Tasks
- [ ] Design device pairing protocol
- [ ] Implement device-to-device QR pairing
- [ ] Create encrypted backup format
- [ ] Implement backup export (encrypted)
- [ ] Implement backup import
- [ ] Add device management UI
- [ ] Sync new messages across devices
- [ ] Handle offline device sync on reconnect

## Technical Details

### Device Pairing Flow
1. Primary device generates pairing QR code
2. QR contains:
   - Temporary pairing key
   - Device info
   - Timestamp
3. Secondary device scans QR
4. Devices establish temporary encrypted channel
5. Primary device sends:
   - Master key (encrypted)
   - Contact list
   - Message history
6. Secondary device decrypts and imports

### Encrypted Backup Format
```json
{
    "version": 1,
    "created": 1705780000000,
    "encrypted": true,
    "data": {
        "contacts": "encrypted_base64...",
        "messages": "encrypted_base64...",
        "keys": "encrypted_base64..."
    },
    "checksum": "sha256..."
}
```

### Key Derivation for Backup
```
backup_key = HKDF(master_key, "arkachat-backup-v1")
```

## Security Considerations
- Backup encryption key derived from user password
- Device pairing requires physical proximity (QR)
- Old devices can be remotely revoked
- Message keys not included in backup (forward secrecy)

## Acceptance Criteria
- [ ] Can pair Android with Web
- [ ] Contacts sync between devices
- [ ] New messages appear on all devices
- [ ] Can export encrypted backup
- [ ] Can import backup on new device
- [ ] Can revoke device access
