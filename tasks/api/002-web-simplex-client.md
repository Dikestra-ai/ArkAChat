---
id: api-002
title: "Web SimpleX WebSocket Client"
status: todo
priority: medium
tags: [web, network, simplex, websocket]
dependencies: [setup-003]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 4h
complexity: 4
area: api
---

# Web SimpleX WebSocket Client

## Context
Implement the SimpleX protocol client for the web app using browser WebSocket API.

## Objectives
- Create WebSocket client for SimpleX servers
- Implement message queue management
- Handle browser-specific connection lifecycle
- Support Service Worker for background sync

## Tasks
- [ ] Create `src/lib/simplex/client.ts`
- [ ] Implement WebSocket connection management
- [ ] Create message queue operations
- [ ] Add reconnection with exponential backoff
- [ ] Implement message sending/receiving
- [ ] Create connection state observable
- [ ] Add Service Worker registration for notifications

## Technical Details

### WebSimplexClient API
```typescript
export class WebSimplexClient {
  private ws: WebSocket | null = null;
  private state = new BehaviorSubject<ConnectionState>('disconnected');

  constructor(private serverUrl: string = 'wss://smp.simplex.im');

  async connect(): Promise<void>;
  async disconnect(): Promise<void>;

  async createQueue(): Promise<QueueAddress>;
  async deleteQueue(address: QueueAddress): Promise<void>;

  async sendMessage(queueId: string, encrypted: Uint8Array): Promise<void>;

  onMessage(callback: (msg: EncryptedMessage) => void): () => void;
  onStateChange(callback: (state: ConnectionState) => void): () => void;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
```

### Reconnection Strategy
```typescript
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

async reconnect(attempt: number) {
  const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
  await sleep(delay);
  await this.connect();
}
```

### Browser Visibility Handling
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    this.ensureConnected();
  }
});
```

## Acceptance Criteria
- [ ] WebSocket connects to SimpleX server
- [ ] Messages send and receive correctly
- [ ] Reconnects after connection loss
- [ ] Works across browser tabs
- [ ] Connection state updates properly
