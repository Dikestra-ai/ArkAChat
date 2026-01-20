---
id: frontend-007
title: "Web Chat UI Integration with ShieldSimplexBridge"
status: done
priority: critical
tags: [web, ui, react, nextjs, integration]
dependencies: [backend-008]
assignee: developer
created: 2026-01-20T21:00:00Z
estimate: 4h
complexity: 3
area: frontend
---

# Web Chat UI Integration with ShieldSimplexBridge

## Context
Wire the existing React/Next.js chat UI to the shieldSimplexBridge for end-to-end encrypted messaging.

## Objectives
- Connect Chat components to shieldSimplexBridge
- Enable QR code scanning and generation for contact pairing
- Display message status (sending, sent, delivered, read)
- Support file attachment sending and receiving
- Real-time message updates via Zustand store

## Tasks
- [ ] Create useChatBridge hook
- [ ] Update ChatPage to use bridge
- [ ] Implement QR code generation component
- [ ] Implement QR code scanner component (webcam)
- [ ] Wire send button to sendTextMessage
- [ ] Wire file attachment to sendFile
- [ ] Display message delivery/read status indicators
- [ ] Handle incoming messages in real-time
- [ ] Add typing indicators
- [ ] Implement encrypted/decrypted file download options

## Technical Details

### useChatBridge Hook
```typescript
import { useEffect, useCallback } from 'react';
import { useChatStore } from '@/lib/storage/chatStore';
import { ShieldSimplexBridge } from '@/lib/bridge/shieldSimplexBridge';

let bridgeInstance: ShieldSimplexBridge | null = null;

export function useChatBridge() {
    const { contacts, messages, addMessage, updateMessage, addContact } = useChatStore();

    useEffect(() => {
        if (!bridgeInstance) {
            bridgeInstance = new ShieldSimplexBridge();
            bridgeInstance.start();
        }
        return () => {
            // Cleanup on unmount if needed
        };
    }, []);

    const sendMessage = useCallback(async (contactId: string, text: string) => {
        if (!bridgeInstance) return;
        await bridgeInstance.sendTextMessage(contactId, text);
    }, []);

    const sendFile = useCallback(async (contactId: string, file: File) => {
        if (!bridgeInstance) return;
        await bridgeInstance.sendFile(contactId, file);
    }, []);

    const createInvitation = useCallback(async (displayName: string) => {
        if (!bridgeInstance) return null;
        return await bridgeInstance.createInvitation(displayName);
    }, []);

    const acceptInvitation = useCallback(async (qrData: string) => {
        if (!bridgeInstance) return null;
        return await bridgeInstance.acceptInvitation(qrData);
    }, []);

    return {
        contacts,
        messages,
        sendMessage,
        sendFile,
        createInvitation,
        acceptInvitation,
    };
}
```

### ChatPage Updates
```typescript
'use client';

import { useChatBridge } from '@/hooks/useChatBridge';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { ChatHeader } from '@/components/chat/ChatHeader';

export default function ChatPage({ params }: { params: { contactId: string } }) {
    const { contacts, messages, sendMessage, sendFile } = useChatBridge();

    const contact = contacts.find(c => c.id === params.contactId);
    const chatMessages = messages.filter(m => m.contactId === params.contactId);

    const handleSend = async (text: string) => {
        await sendMessage(params.contactId, text);
    };

    const handleFileAttach = async (file: File) => {
        await sendFile(params.contactId, file);
    };

    return (
        <div className="flex flex-col h-full">
            <ChatHeader contact={contact} />
            <MessageList messages={chatMessages} />
            <MessageInput onSend={handleSend} onAttach={handleFileAttach} />
        </div>
    );
}
```

### QR Code Components
```typescript
// QRGenerator.tsx
import QRCode from 'qrcode.react';

export function QRGenerator({ data }: { data: string }) {
    return (
        <div className="p-4 bg-white rounded-lg">
            <QRCode value={data} size={256} level="M" />
            <p className="mt-2 text-sm text-gray-500 text-center">
                Scan this code to add me as a contact
            </p>
        </div>
    );
}

// QRScanner.tsx - using html5-qrcode
import { Html5QrcodeScanner } from 'html5-qrcode';

export function QRScanner({ onScan }: { onScan: (data: string) => void }) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        scannerRef.current = new Html5QrcodeScanner('qr-reader', {
            fps: 10,
            qrbox: { width: 250, height: 250 },
        }, false);

        scannerRef.current.render(
            (decodedText) => {
                onScan(decodedText);
                scannerRef.current?.clear();
            },
            (error) => console.warn(error)
        );

        return () => {
            scannerRef.current?.clear();
        };
    }, [onScan]);

    return <div id="qr-reader" className="w-full max-w-md" />;
}
```

### Message Status UI
```typescript
function MessageStatus({ status }: { status: MessageStatus }) {
    switch (status) {
        case 'sending':
            return <Spinner className="w-3 h-3" />;
        case 'sent':
            return <CheckIcon className="w-3 h-3 text-gray-400" />;
        case 'delivered':
            return <CheckCheckIcon className="w-3 h-3 text-gray-400" />;
        case 'read':
            return <CheckCheckIcon className="w-3 h-3 text-blue-500" />;
        case 'failed':
            return <XCircleIcon className="w-3 h-3 text-red-500" />;
    }
}
```

## Files to Create/Modify
- `hooks/useChatBridge.ts` - Create new
- `app/chat/[contactId]/page.tsx` - Update
- `components/chat/MessageBubble.tsx` - Add status indicators
- `components/chat/MessageInput.tsx` - Add file attachment
- `components/contacts/QRGenerator.tsx` - Create new
- `components/contacts/QRScanner.tsx` - Create new
- `components/contacts/AddContactModal.tsx` - Create new

## Dependencies to Add
```json
{
    "qrcode.react": "^3.1.0",
    "html5-qrcode": "^2.3.8"
}
```

## Acceptance Criteria
- [ ] Messages send and receive in real-time
- [ ] QR code pairing works for new contacts
- [ ] Message status updates correctly
- [ ] Files can be attached and sent
- [ ] File download options (encrypted/decrypted) work
- [ ] Typing indicators show for active contacts
