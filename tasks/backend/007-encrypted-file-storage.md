---
id: backend-007
title: "Encrypted File Storage with Shield"
status: done
priority: high
tags: [storage, encryption, files, shield, android, web]
dependencies: [backend-004]
assignee: developer
created: 2026-01-20T19:00:00Z
estimate: 4h
complexity: 3
area: backend
---

# Encrypted File Storage with Shield

## Context
All files (media, documents, attachments) should be stored encrypted using Shield's StreamCipher.
Files should be downloadable in either encrypted or decrypted form.

## Objectives
- Store all files encrypted at rest using Shield
- Support downloading files in encrypted form (for backup/transfer)
- Support downloading files in decrypted form (for viewing)
- Efficient streaming encryption for large files
- Metadata encryption (filename, size, type)

## Tasks
- [x] Create `EncryptedFileStorage` class for Android
- [x] Create `EncryptedFileStorage` class for Web
- [x] Implement file encryption on save
- [x] Implement file decryption on load
- [x] Add encrypted download option
- [x] Add decrypted download option
- [x] Encrypt file metadata (name, type, size)
- [ ] Add progress callbacks for large files
- [ ] Implement chunked upload/download for very large files

## Technical Details

### File Storage Format
```
┌─────────────────────────────────────────────┐
│ Magic Header (8 bytes): "SHLD_ENC"          │
├─────────────────────────────────────────────┤
│ Version (1 byte): 0x01                      │
├─────────────────────────────────────────────┤
│ Metadata Length (4 bytes, little-endian)    │
├─────────────────────────────────────────────┤
│ Encrypted Metadata (JSON):                  │
│   - original_name                           │
│   - mime_type                               │
│   - original_size                           │
│   - created_at                              │
│   - checksum (SHA256 of plaintext)          │
├─────────────────────────────────────────────┤
│ Encrypted File Content (StreamCipher)       │
│   - Uses per-file derived key               │
│   - Streaming encryption for large files    │
└─────────────────────────────────────────────┘
```

### Key Derivation
- Per-contact media key stored in KeyManager
- Per-file key derived: `file_key = HKDF(media_key, file_id)`
- Prevents key reuse across files

### Android Implementation
```kotlin
class EncryptedFileStorage(
    private val context: Context,
    private val keyManager: KeyManager
) {
    suspend fun saveEncrypted(
        contactId: String,
        file: File,
        metadata: FileMetadata
    ): EncryptedFile

    suspend fun loadDecrypted(
        contactId: String,
        encryptedFile: EncryptedFile
    ): File

    suspend fun downloadEncrypted(
        encryptedFile: EncryptedFile
    ): ByteArray  // For backup/transfer

    suspend fun downloadDecrypted(
        contactId: String,
        encryptedFile: EncryptedFile
    ): ByteArray  // For viewing
}
```

### Web Implementation
```typescript
class EncryptedFileStorage {
    async saveEncrypted(
        contactId: string,
        file: File,
        metadata: FileMetadata
    ): Promise<EncryptedFile>;

    async loadDecrypted(
        contactId: string,
        encryptedFile: EncryptedFile
    ): Promise<Blob>;

    async downloadEncrypted(
        encryptedFile: EncryptedFile
    ): Promise<Blob>;  // For backup/transfer

    async downloadDecrypted(
        contactId: string,
        encryptedFile: EncryptedFile
    ): Promise<Blob>;  // For viewing
}
```

## Acceptance Criteria
- [x] Files stored encrypted at rest
- [x] Can download encrypted file (preserves encryption)
- [x] Can download decrypted file (for viewing)
- [x] Metadata (filename, type) also encrypted
- [ ] Large files (>100MB) stream without OOM
- [ ] Cross-platform: Android encrypted file readable on Web
