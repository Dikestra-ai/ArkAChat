---
id: api-003
title: "Web: Shield + SimpleX Full Integration"
status: done
priority: critical
tags: [web, shield, simplex, integration]
dependencies: [backend-004, backend-005]
assignee: developer
created: 2026-01-20T18:00:00Z
estimate: 4h
complexity: 4
area: api
---

# Web: Shield + SimpleX Full Integration

## Context
Complete integration of Shield crypto library and SimpleX messaging for Web app.

## Objectives
- Wire up Shield RatchetSession with SimpleX message flow
- Implement secure contact pairing with QRExchange
- Handle encrypted message send/receive through SimpleX
- Store session state in IndexedDB

## Tasks
- [x] Update crypto.ts to use browser-compatible Shield implementation
- [x] Update client.ts to use SMP WebSocket protocol
- [x] Create shieldSimplexBridge.ts to connect both
- [x] Update chatStore.ts for encrypted messaging
- [x] Implement QR pairing flow with QRExchange
- [x] Persist RatchetSession state in IndexedDB
- [x] Handle session recovery on page reload
- [ ] Implement Service Worker for background sync

## Technical Details

### Shield + SimpleX Bridge
```typescript
// src/lib/bridge/shieldSimplexBridge.ts
import { RatchetSession, QRExchange } from '@guard8/shield';
import { SimplexClient } from '../simplex/client';
import { useChatStore } from '../storage/chatStore';

export class ShieldSimplexBridge {
  private sessions = new Map<string, RatchetSession>();

  constructor(
    private simplex: SimplexClient,
    private keyStore: KeyStore
  ) {}

  async sendEncryptedMessage(contactId: string, plaintext: string) {
    const contact = useChatStore.getState().contacts.find(c => c.id === contactId);
    const session = await this.getSession(contactId, contact.isInitiator);

    // Encrypt with Shield
    const encrypted = session.encrypt(new TextEncoder().encode(plaintext));

    // Send via SimpleX
    await this.simplex.sendMessage(contact.simplexContactId, encrypted);

    // Persist session state
    await this.persistSession(contactId, session);
  }

  async handleIncomingMessage(simplexMessage: any) {
    const contact = this.findContactBySimplexId(simplexMessage.contactId);
    const session = await this.getSession(contact.id, contact.isInitiator);

    // Decrypt with Shield
    const plaintext = session.decrypt(simplexMessage.content);

    // Update store
    useChatStore.getState().addMessage({
      content: new TextDecoder().decode(plaintext),
      contactId: contact.id,
      // ...
    });
  }
}
```

### Contact Pairing
```typescript
// src/lib/pairing/contactPairing.ts
import { QRExchange } from '@guard8/shield';

export class ContactPairing {
  async createInvitation(): Promise<string> {
    // Create SimpleX connection
    const simplexInvite = await this.simplex.createConnection();

    // Create Shield key exchange
    const qrExchange = new QRExchange();
    const shieldData = qrExchange.generateInvitation();

    return JSON.stringify({
      simplex: simplexInvite,
      shield: shieldData,
      timestamp: Date.now()
    });
  }

  async acceptInvitation(qrData: string): Promise<Contact> {
    const invitation = JSON.parse(qrData);

    // Accept SimpleX connection
    const simplexContact = await this.simplex.acceptConnection(invitation.simplex);

    // Complete Shield key exchange
    const qrExchange = new QRExchange();
    const sharedKey = qrExchange.acceptInvitation(invitation.shield);

    return this.createContact(simplexContact, sharedKey);
  }
}
```

### IndexedDB Session Storage
```typescript
// src/lib/storage/sessionStore.ts
import { openDB } from 'idb';

const db = await openDB('chatguard-sessions', 1, {
  upgrade(db) {
    db.createObjectStore('sessions', { keyPath: 'contactId' });
  }
});

export async function persistSession(contactId: string, session: RatchetSession) {
  await db.put('sessions', {
    contactId,
    sendKey: session.exportSendKey(),
    recvKey: session.exportRecvKey(),
    sendCounter: session.sendCounter,
    recvCounter: session.recvCounter
  });
}
```

## Acceptance Criteria
- [x] Messages encrypted with Shield before SimpleX send
- [x] Messages decrypted with Shield after SimpleX receive
- [x] QR pairing works in browser
- [x] Session state persists in IndexedDB
- [ ] Compatible with Android app (cross-platform)
