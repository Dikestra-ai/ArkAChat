---
id: api-001
title: "Web Shield WASM Integration"
status: todo
priority: medium
tags: [web, crypto, shield, wasm]
dependencies: [setup-003]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 4h
complexity: 4
area: api
---

# Web Shield WASM Integration

## Context
Implement the Shield encryption layer for the web app using WebAssembly, mirroring the Android ShieldCrypto API.

## Objectives
- Initialize Shield WASM module
- Implement WebShieldCrypto class
- Create IndexedDB-backed key storage
- Handle password-based key encryption

## Tasks
- [ ] Create `src/lib/shield/crypto.ts` main class
- [ ] Implement WASM module initialization
- [ ] Create `ChatSession` class with encrypt/decrypt
- [ ] Create `MediaEncryption` class for files
- [ ] Implement `src/lib/shield/keystore.ts` for IndexedDB
- [ ] Add password derivation for key protection
- [ ] Handle Web Crypto API fallbacks

## Technical Details

### WebShieldCrypto API
```typescript
export class WebShieldCrypto {
  private shield: ShieldBrowser;
  private sessions = new Map<string, ChatSession>();

  async initialize(): Promise<void>;

  async createSession(
    contactId: string,
    isInitiator: boolean
  ): Promise<ChatSession>;

  async generateSharedKey(contactId: string): Promise<Uint8Array>;
}

class ChatSession {
  async encryptMessage(message: string): Promise<Uint8Array>;
  async decryptMessage(ciphertext: Uint8Array): Promise<string>;
}

class MediaEncryption {
  async encryptFile(file: File): Promise<Blob>;
  async decryptFile(encrypted: Blob): Promise<Blob>;
}
```

### Key Storage (IndexedDB)
```typescript
// Keys encrypted with user password before storage
interface StoredKey {
  id: string;
  encryptedKey: Uint8Array;
  salt: Uint8Array;
  createdAt: number;
}

class WebKeyStore {
  async store(keyId: string, key: Uint8Array): Promise<void>;
  async retrieve(keyId: string): Promise<Uint8Array>;
  async delete(keyId: string): Promise<void>;
}
```

## Acceptance Criteria
- [ ] WASM module loads in browser
- [ ] Encryption/decryption works correctly
- [ ] Keys persist in IndexedDB
- [ ] Password protection works
- [ ] Compatible with Android encryption
