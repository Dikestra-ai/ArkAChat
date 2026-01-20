---
id: frontend-005
title: "Web Chat UI (React)"
status: todo
priority: medium
tags: [web, react, ui, chat]
dependencies: [api-001, api-002]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 4h
complexity: 3
area: frontend
---

# Web Chat UI (React)

## Context
Implement the web chat interface using React with Tailwind CSS and shadcn/ui components.

## Objectives
- Create responsive chat window component
- Implement message list with virtualization
- Add message input with attachment support
- Show encryption status indicator

## Tasks
- [ ] Create `ChatWindow.tsx` main component
- [ ] Implement `MessageBubble.tsx` component
- [ ] Create `MessageInput.tsx` with send button
- [ ] Add `ChatHeader.tsx` with security indicator
- [ ] Implement `ContactList.tsx` sidebar
- [ ] Add responsive layout (mobile/desktop)
- [ ] Create `useChatStore.ts` Zustand store

## Technical Details

### Component Structure
```typescript
// ChatWindow.tsx
export default function ChatWindow({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const { messages, sendMessage, connectionState } = useChatStore();

  return (
    <div className="flex flex-col h-screen">
      <ChatHeader name={contactName} isSecure={true} />
      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} />
    </div>
  );
}
```

### Responsive Layout
```
Desktop (>=1024px):
┌──────────────┬─────────────────────────────────┐
│  Contacts    │         Chat Window             │
│  Sidebar     │                                 │
│  (300px)     │         (flex-1)                │
└──────────────┴─────────────────────────────────┘

Mobile (<1024px):
┌─────────────────────────────────┐
│  Contacts List (full width)     │
│        OR                       │
│  Chat Window (full width)       │
└─────────────────────────────────┘
```

### Message Virtualization
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function MessageList({ messages }: { messages: Message[] }) {
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
  });
  // ...
}
```

## Acceptance Criteria
- [ ] Chat displays messages correctly
- [ ] Input sends encrypted messages
- [ ] Responsive on mobile and desktop
- [ ] Virtual scrolling handles large lists
- [ ] Security indicator shows Shield status
