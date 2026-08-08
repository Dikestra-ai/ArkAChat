/**
 * SimpleX Messaging Protocol (SMP) Client for Browser.
 *
 * Implements the SMP protocol for zero-identifier messaging.
 * Uses ephemeral message queues with no user identifiers.
 *
 * Public SMP Servers:
 * - smp4.simplex.im
 * - smp5.simplex.im
 * - smp6.simplex.im
 *
 * Protocol Reference:
 * https://github.com/simplex-chat/simplexmq/blob/stable/protocol/simplex-messaging.md
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * SMP Queue Address - represents a message queue on an SMP server.
 */
export interface SMPQueueAddress {
  server: string;
  queueId: Uint8Array;
  recipientKey: Uint8Array;
  senderKey?: Uint8Array;
}

/**
 * Encrypted message received from SMP server.
 */
export interface SMPMessage {
  queueAddress: SMPQueueAddress;
  ciphertext: Uint8Array;
  timestamp: number;
  msgId: Uint8Array;
}

/**
 * SMP Connection Invitation - for QR code pairing.
 * connReqUri     = Queue A (inviter's receive queue, created + subscribed by inviter)
 * replyConnReqUri = Queue B (pre-allocated by inviter, invitee subscribes to this)
 */
export interface SMPInvitation {
  connReqUri: string;
  replyConnReqUri?: string;   // Pre-allocated queue for invitee to receive on
  shieldKey: Uint8Array;
  displayName: string;
  timestamp: number;
}

type MessageCallback = (message: SMPMessage) => void;
type StateCallback = (state: ConnectionState) => void;

// Public SMP servers (no API key required)
export const PUBLIC_SMP_SERVERS = [
  'smp4.simplex.im',
  'smp5.simplex.im',
  'smp6.simplex.im',
];

// SMP Protocol Commands
const CMD_NEW = 0x01;      // Create new queue
const CMD_KEY = 0x02;      // Sender key confirmation
const CMD_SEND = 0x03;     // Send message
const CMD_MSG = 0x04;      // Message received
const CMD_ACK = 0x05;      // Acknowledge message
const CMD_OFF = 0x06;      // Suspend queue
const CMD_DEL = 0x07;      // Delete queue
const CMD_SUB = 0x08;      // Subscribe to queue
const CMD_END = 0x09;      // Queue ended
const CMD_ERR = 0x10;      // Error response
const CMD_OK = 0x11;       // Success response

// Queue ID and key sizes
const QUEUE_ID_SIZE = 24;
const KEY_SIZE = 32;

/**
 * Encode queue address as SMP URI.
 * Supports both smp:// (public SMP server) and relay:// (local dev relay) schemes.
 */
export function encodeQueueUri(address: SMPQueueAddress): string {
  const queueIdB64 = toBase64Url(address.queueId);
  const recipientKeyB64 = toBase64Url(address.recipientKey);
  const senderPart = address.senderKey ? `/${toBase64Url(address.senderKey)}` : '';
  const scheme = address.server === 'local' ? 'relay' : 'smp';
  return `${scheme}://${address.server}#${queueIdB64}/${recipientKeyB64}${senderPart}`;
}

/**
 * Decode SMP or relay URI to queue address.
 */
export function decodeQueueUri(uri: string): SMPQueueAddress | null {
  const regex = /(?:smp|relay):\/\/([^#]+)#([^/]+)\/([^/]+)(?:\/([^/]+))?/;
  const match = uri.match(regex);
  if (!match) return null;

  const [, server, queueIdB64, recipientKeyB64, senderKeyB64] = match;
  return {
    server,
    queueId: fromBase64Url(queueIdB64),
    recipientKey: fromBase64Url(recipientKeyB64),
    senderKey: senderKeyB64 ? fromBase64Url(senderKeyB64) : undefined,
  };
}

/**
 * Encode invitation as JSON for QR code.
 */
export function encodeInvitation(invitation: SMPInvitation): string {
  const obj: Record<string, unknown> = {
    uri: invitation.connReqUri,
    k: toBase64Url(invitation.shieldKey),
    n: invitation.displayName,
    ts: invitation.timestamp,
  };
  if (invitation.replyConnReqUri) {
    obj.ru = invitation.replyConnReqUri;
  }
  return JSON.stringify(obj);
}

/**
 * Decode invitation from JSON.
 */
export function decodeInvitation(json: string): SMPInvitation | null {
  try {
    const data = JSON.parse(json);
    return {
      connReqUri: data.uri,
      replyConnReqUri: data.ru as string | undefined,
      shieldKey: fromBase64Url(data.k),
      displayName: data.n,
      timestamp: data.ts,
    };
  } catch {
    return null;
  }
}

/**
 * Web SimpleX SMP Client.
 */
export class WebSimplexClient {
  private serverConnections = new Map<string, WebSocket>();
  private serverStates = new Map<string, ConnectionState>();
  private globalState: ConnectionState = 'disconnected';

  private messageCallbacks = new Set<MessageCallback>();
  private stateCallbacks = new Set<StateCallback>();

  private pendingResponses = new Map<string, {
    resolve: (data: Uint8Array) => void;
    reject: (error: Error) => void;
  }>();

  private subscribedQueues = new Map<string, SMPQueueAddress>();

  private proxyUrl: string | null = null;

  /**
   * Configure Shield proxy for transport-layer encryption.
   * When set, all connections route through the proxy.
   * Pass null to disable and use direct connections.
   */
  setProxy(url: string | null): void {
    this.proxyUrl = url;
  }

  /**
   * Connect to multiple SMP servers for redundancy.
   */
  async connect(servers: string[] = PUBLIC_SMP_SERVERS): Promise<void> {
    const connectPromises = servers.map((server) => this.connectToServer(server));
    await Promise.allSettled(connectPromises);
  }

  private async connectToServer(server: string): Promise<void> {
    const currentState = this.serverStates.get(server);
    if (currentState === 'connecting' || currentState === 'connected') {
      return;
    }

    this.serverStates.set(server, 'connecting');
    this.updateGlobalState();

    const wsUrl = this.proxyUrl
      ? `${this.proxyUrl}/ws/${server}:5223`
      : `wss://${server}:5223`;

    return new Promise((resolve, reject) => {
      try {
        // Note: Browser WebSocket API does not support certificate pinning.
        // Transport security relies on browser TLS validation and shield-proxy (when configured).
        const ws = new WebSocket(wsUrl, ['smp/1']);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          this.serverStates.set(server, 'connected');
          this.serverConnections.set(server, ws);
          this.updateGlobalState();

          // Re-subscribe to queues on this server
          this.resubscribeQueues(server);
          resolve();
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            this.handleServerMessage(server, new Uint8Array(event.data));
          }
        };

        ws.onerror = () => {
          this.serverStates.set(server, 'error');
          this.serverConnections.delete(server);
          this.updateGlobalState();
          reject(new Error(`WebSocket error for ${server}`));
        };

        ws.onclose = (event) => {
          this.serverStates.set(server, 'disconnected');
          this.serverConnections.delete(server);
          this.updateGlobalState();

          if (event.code !== 1000) {
            this.scheduleReconnect(server);
          }
        };
      } catch (error) {
        this.serverStates.set(server, 'error');
        this.updateGlobalState();
        reject(error);
      }
    });
  }

  private updateGlobalState(): void {
    const states = Array.from(this.serverStates.values());

    let newState: ConnectionState;
    if (states.some((s) => s === 'connected')) {
      newState = 'connected';
    } else if (states.every((s) => s === 'error')) {
      newState = 'error';
    } else if (states.some((s) => s === 'connecting')) {
      newState = 'connecting';
    } else {
      newState = 'disconnected';
    }

    if (newState !== this.globalState) {
      this.globalState = newState;
      this.stateCallbacks.forEach((cb) => cb(newState));
    }
  }

  /**
   * Disconnect from all servers.
   */
  disconnect(): void {
    this.serverConnections.forEach((ws) => {
      ws.close(1000, 'User disconnect');
    });
    this.serverConnections.clear();
    this.serverStates.clear();
    this.globalState = 'disconnected';
    this.stateCallbacks.forEach((cb) => cb('disconnected'));
  }

  /**
   * Create a new message queue on a random SMP server.
   */
  async createQueue(preferredServer?: string): Promise<SMPQueueAddress> {
    const server = preferredServer ?? this.selectServer();
    if (!server) {
      throw new Error('No connected SMP servers');
    }

    const recipientKey = crypto.getRandomValues(new Uint8Array(KEY_SIZE));
    const senderKey = crypto.getRandomValues(new Uint8Array(KEY_SIZE));

    // Build NEW command: cmd + recipientKey + senderKey
    const command = new Uint8Array(1 + KEY_SIZE + KEY_SIZE);
    command[0] = CMD_NEW;
    command.set(recipientKey, 1);
    command.set(senderKey, 1 + KEY_SIZE);

    const corrId = this.generateCorrelationId();
    const response = await this.sendCommandWithResponse(server, corrId, command);

    if (response[0] !== CMD_OK) {
      throw new SMPError(`Failed to create queue: ${this.parseError(response)}`);
    }

    const assignedQueueId = response.slice(1, 1 + QUEUE_ID_SIZE);

    const address: SMPQueueAddress = {
      server,
      queueId: assignedQueueId,
      recipientKey,
      senderKey,
    };

    // Subscribe to the new queue
    await this.subscribeToQueue(address);

    return address;
  }

  /**
   * Subscribe to receive messages from a queue.
   */
  async subscribeToQueue(address: SMPQueueAddress): Promise<void> {
    const key = `${address.server}:${toHex(address.queueId)}`;
    if (this.subscribedQueues.has(key)) return;

    const command = new Uint8Array(1 + QUEUE_ID_SIZE + KEY_SIZE);
    command[0] = CMD_SUB;
    command.set(address.queueId, 1);
    command.set(address.recipientKey, 1 + QUEUE_ID_SIZE);

    const corrId = this.generateCorrelationId();
    const response = await this.sendCommandWithResponse(address.server, corrId, command);

    if (response[0] !== CMD_OK) {
      throw new SMPError(`Failed to subscribe: ${this.parseError(response)}`);
    }

    this.subscribedQueues.set(key, address);
  }

  /**
   * Send an encrypted message to a queue.
   */
  async sendMessage(address: SMPQueueAddress, encryptedMessage: Uint8Array): Promise<void> {
    if (!address.senderKey) {
      throw new Error('Sender key required to send messages');
    }

    // Sign the message with sender key (HMAC-SHA256)
    const signature = await this.hmacSha256(address.senderKey, encryptedMessage);

    // Build SEND command: cmd + queueId + signature + message
    const command = new Uint8Array(1 + QUEUE_ID_SIZE + 32 + encryptedMessage.length);
    command[0] = CMD_SEND;
    command.set(address.queueId, 1);
    command.set(signature, 1 + QUEUE_ID_SIZE);
    command.set(encryptedMessage, 1 + QUEUE_ID_SIZE + 32);

    const corrId = this.generateCorrelationId();
    const response = await this.sendCommandWithResponse(address.server, corrId, command);

    if (response[0] !== CMD_OK) {
      throw new SMPError(`Failed to send message: ${this.parseError(response)}`);
    }
  }

  /**
   * Acknowledge receipt of a message.
   */
  async acknowledgeMessage(address: SMPQueueAddress, msgId: Uint8Array): Promise<void> {
    const command = new Uint8Array(1 + QUEUE_ID_SIZE + KEY_SIZE + msgId.length);
    command[0] = CMD_ACK;
    command.set(address.queueId, 1);
    command.set(address.recipientKey, 1 + QUEUE_ID_SIZE);
    command.set(msgId, 1 + QUEUE_ID_SIZE + KEY_SIZE);

    const corrId = this.generateCorrelationId();
    await this.sendCommandWithResponse(address.server, corrId, command);
  }

  /**
   * Delete a queue.
   */
  async deleteQueue(address: SMPQueueAddress): Promise<void> {
    const key = `${address.server}:${toHex(address.queueId)}`;
    this.subscribedQueues.delete(key);

    const command = new Uint8Array(1 + QUEUE_ID_SIZE + KEY_SIZE);
    command[0] = CMD_DEL;
    command.set(address.queueId, 1);
    command.set(address.recipientKey, 1 + QUEUE_ID_SIZE);

    const corrId = this.generateCorrelationId();
    await this.sendCommandWithResponse(address.server, corrId, command);
  }

  /**
   * Create a connection invitation for QR code pairing.
   */
  async createInvitation(displayName: string, shieldKey: Uint8Array): Promise<SMPInvitation> {
    const queue = await this.createQueue();
    return {
      connReqUri: encodeQueueUri(queue),
      shieldKey,
      displayName,
      timestamp: Date.now(),
    };
  }

  /**
   * Accept a connection invitation (from QR code scan).
   */
  async acceptInvitation(invitation: SMPInvitation): Promise<SMPQueueAddress> {
    const queue = decodeQueueUri(invitation.connReqUri);
    if (!queue) {
      throw new Error('Invalid connection request URI');
    }

    // Connect to the server if not already connected
    if (!this.serverConnections.has(queue.server)) {
      await this.connectToServer(queue.server);
    }

    return queue;
  }

  /**
   * Subscribe to incoming messages.
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  /**
   * Subscribe to connection state changes.
   */
  onStateChange(callback: StateCallback): () => void {
    this.stateCallbacks.add(callback);
    callback(this.globalState);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return this.globalState;
  }

  // Private helpers

  private selectServer(): string | undefined {
    const connected = Array.from(this.serverConnections.keys())
      .filter((server) => this.serverStates.get(server) === 'connected');

    if (connected.length === 0) return undefined;
    return connected[Math.floor(Math.random() * connected.length)];
  }

  private async sendCommandWithResponse(
    server: string,
    correlationId: string,
    command: Uint8Array
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.pendingResponses.set(correlationId, { resolve, reject });

      // Prepend correlation ID (16 bytes) to command
      const corrIdBytes = new TextEncoder().encode(correlationId.padEnd(16, '\0')).slice(0, 16);
      const fullCommand = new Uint8Array(16 + command.length);
      fullCommand.set(corrIdBytes, 0);
      fullCommand.set(command, 16);

      const ws = this.serverConnections.get(server);
      if (!ws) {
        this.pendingResponses.delete(correlationId);
        reject(new Error(`Not connected to server: ${server}`));
        return;
      }

      ws.send(fullCommand);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingResponses.has(correlationId)) {
          this.pendingResponses.delete(correlationId);
          reject(new Error('Command timed out'));
        }
      }, 30000);
    });
  }

  private handleServerMessage(server: string, data: Uint8Array): void {
    if (data.length < 17) return;

    const corrIdBytes = data.slice(0, 16);
    const corrId = new TextDecoder().decode(corrIdBytes).replace(/\0/g, '').trim();
    const payload = data.slice(16);

    // Check if this is a response to a pending command
    const pending = this.pendingResponses.get(corrId);
    if (pending) {
      this.pendingResponses.delete(corrId);
      pending.resolve(payload);
    }

    // Handle push messages
    if (payload.length > 0 && payload[0] === CMD_MSG) {
      const msgIdStart = 1;
      const msgIdEnd = msgIdStart + 24;
      const ciphertextStart = msgIdEnd;

      if (payload.length > ciphertextStart) {
        const msgId = payload.slice(msgIdStart, msgIdEnd);
        const ciphertext = payload.slice(ciphertextStart);

        // Find the queue this message belongs to
        const queue = Array.from(this.subscribedQueues.values())
          .find((q) => q.server === server);

        if (queue) {
          const message: SMPMessage = {
            queueAddress: queue,
            ciphertext,
            timestamp: Date.now(),
            msgId,
          };

          this.messageCallbacks.forEach((cb) => cb(message));
        }
      }
    }
  }

  private resubscribeQueues(server: string): void {
    Array.from(this.subscribedQueues.values())
      .filter((queue) => queue.server === server)
      .forEach((queue) => {
        this.subscribeToQueue(queue).catch(console.error);
      });
  }

  private scheduleReconnect(server: string): void {
    const delay = 3000 + Math.floor(Math.random() * 4000); // 3-7 seconds
    setTimeout(() => {
      if (this.serverStates.get(server) !== 'connected') {
        this.connectToServer(server).catch(console.error);
      }
    }, delay);
  }

  private generateCorrelationId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return toHex(bytes);
  }

  private parseError(response: Uint8Array): string {
    return response.length > 1 ? `Error code: ${response[1]}` : 'Unknown error';
  }

  private async hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
    return new Uint8Array(signature);
  }
}

export class SMPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SMPError';
  }
}

// Utility functions

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(bytes)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// LocalRelayClient
//
// Connects to the local dev relay (relay/index.mjs) instead of public SMP
// servers. Uses JSON over WebSocket, so it works from any browser or WebView
// without needing raw TCP access to smp*.simplex.im.
//
// Queue URIs use the relay:// scheme: relay://local#queueId/recipientKey
// ─────────────────────────────────────────────────────────────────────────────

const LOCAL_RELAY_PORT = 3004;

/** Returns the relay WS URL. Always uses localhost — on Android the adb reverse
 *  tunnel (adb reverse tcp:3004 tcp:3004) maps localhost inside the emulator to
 *  the host machine's relay, so both Firefox and WebView use the same URL. */
function relayUrl(): string {
  return `ws://localhost:${LOCAL_RELAY_PORT}`;
}

type RelayResolve = (data: unknown) => void;

export class LocalRelayClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private messageCallbacks = new Set<MessageCallback>();
  private stateCallbacks = new Set<StateCallback>();
  private pending = new Map<string, { resolve: RelayResolve; reject: (e: Error) => void }>();
  private subscribedQueues = new Map<string, SMPQueueAddress>();

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.setState('connecting');

    const url = relayUrl();
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          this.ws = ws;
          this.setState('connected');
          resolve();
        };
        ws.onmessage = (ev) => this.handleMessage(JSON.parse(ev.data as string));
        ws.onerror = () => {
          this.setState('error');
          reject(new Error('LocalRelay: websocket error'));
        };
        ws.onclose = () => {
          this.ws = null;
          this.setState('disconnected');
          setTimeout(() => this.connect().catch(() => {}), 5000);
        };
      } catch (err) {
        this.setState('error');
        reject(err);
      }
    });
  }

  disconnect(): void {
    this.ws?.close(1000, 'disconnect');
    this.ws = null;
    this.setState('disconnected');
  }

  // ── Queue operations ─────────────────────────────────────────────────────

  /** Create a queue on the relay WITHOUT subscribing to it. */
  private async createQueueOnly(): Promise<SMPQueueAddress> {
    const queueId = crypto.getRandomValues(new Uint8Array(24));
    const recipientKey = crypto.getRandomValues(new Uint8Array(32));
    const senderKey = crypto.getRandomValues(new Uint8Array(32));
    const queueIdB64 = toBase64Url(queueId);
    const recipientKeyB64 = toBase64Url(recipientKey);

    await this.rpc('NEW', { queueId: queueIdB64, recipientKey: recipientKeyB64 });

    return {
      server: 'local',
      queueId,
      recipientKey,
      senderKey,
    };
  }

  /** Create a queue on the relay AND subscribe to receive messages on it. */
  async createQueue(): Promise<SMPQueueAddress> {
    const address = await this.createQueueOnly();
    await this.subscribeToQueue(address);
    return address;
  }

  async subscribeToQueue(address: SMPQueueAddress): Promise<void> {
    const key = toBase64Url(address.queueId);
    if (this.subscribedQueues.has(key)) return;
    await this.rpc('SUB', { queueId: key });
    this.subscribedQueues.set(key, address);
  }

  async sendMessage(address: SMPQueueAddress, encryptedMessage: Uint8Array): Promise<void> {
    const queueId = toBase64Url(address.queueId);
    const data = toBase64Url(encryptedMessage);
    await this.rpc('SEND', { queueId, data });
  }

  async acknowledgeMessage(address: SMPQueueAddress, msgId: Uint8Array): Promise<void> {
    const queueId = toBase64Url(address.queueId);
    await this.rpc('ACK', { queueId, msgId: toBase64Url(msgId) });
  }

  /**
   * Create an invitation with two queues:
   *   Queue A = inviter's receive queue (created + subscribed now)
   *   Queue B = invitee's receive queue (pre-allocated, not yet subscribed)
   */
  async createInvitation(displayName: string, shieldKey: Uint8Array): Promise<SMPInvitation> {
    // Queue A: inviter subscribes here — this is where Android sends TO
    const queueA = await this.createQueue();
    // Queue B: pre-allocated for invitee — Chrome will send TO here after pairing
    const queueB = await this.createQueueOnly();
    return {
      connReqUri: encodeQueueUri(queueA),
      replyConnReqUri: encodeQueueUri(queueB),
      shieldKey,
      displayName,
      timestamp: Date.now(),
    };
  }

  /**
   * Accept an invitation (invitee side):
   *   - Do NOT subscribe to Queue A (that's the inviter's receive queue)
   *   - Subscribe to Queue B (from replyConnReqUri) — this is the invitee's receive queue
   *   - Returns Queue A address (where invitee should SEND messages to reach inviter)
   *
   * The caller is responsible for recording which queue to receive on (Queue B).
   */
  async acceptInvitation(invitation: SMPInvitation): Promise<SMPQueueAddress> {
    const queueA = decodeQueueUri(invitation.connReqUri);
    if (!queueA) throw new Error('Invalid connection request URI');

    // Subscribe to Queue B (invitee's receive queue) if provided
    if (invitation.replyConnReqUri) {
      const queueB = decodeQueueUri(invitation.replyConnReqUri);
      if (queueB && queueB.server === 'local') {
        await this.subscribeToQueue(queueB);
      }
    } else if (queueA.server === 'local') {
      // Legacy fallback: single-queue protocol — subscribe to Queue A
      await this.subscribeToQueue(queueA);
    }

    // Return Queue A — this is where the invitee sends outbound messages
    return queueA;
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  onStateChange(callback: StateCallback): () => void {
    this.stateCallbacks.add(callback);
    callback(this.state);
    return () => this.stateCallbacks.delete(callback);
  }

  getState(): ConnectionState {
    return this.state;
  }

  setProxy(_url: string | null): void { /* no-op for relay */ }

  // ── Private helpers ──────────────────────────────────────────────────────

  private setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateCallbacks.forEach((cb) => cb(s));
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private async rpc(cmd: string, params: Record<string, unknown>): Promise<unknown> {
    const id = toHex(crypto.getRandomValues(new Uint8Array(8)));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ cmd, id, ...params });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LocalRelay: ${cmd} timed out`));
        }
      }, 10000);
    });
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Route pending RPC responses
    const id = msg.id as string | undefined;
    if (id && this.pending.has(id)) {
      const { resolve, reject } = this.pending.get(id)!;
      this.pending.delete(id);
      if (msg.cmd === 'ERR') {
        reject(new Error(msg.error as string));
      } else {
        resolve(msg);
      }
      return;
    }

    // Route OK acks (no id)
    if (msg.cmd === 'OK') return;

    // Incoming message pushed by relay
    if (msg.cmd === 'MSG') {
      const queueIdB64 = msg.queueId as string;
      const msgIdB64 = msg.msgId as string;
      const dataB64 = msg.data as string;

      const queue = this.subscribedQueues.get(queueIdB64);
      if (!queue) return;

      const ciphertext = fromBase64Url(dataB64);
      const msgId = fromBase64Url(msgIdB64);

      const smpMsg: SMPMessage = {
        queueAddress: queue,
        ciphertext,
        timestamp: Date.now(),
        msgId,
      };
      this.messageCallbacks.forEach((cb) => cb(smpMsg));

      // Auto-ack
      this.send({ cmd: 'ACK', queueId: queueIdB64, msgId: msgIdB64 });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart singleton: uses local relay in dev, falls back to public SMP
// ─────────────────────────────────────────────────────────────────────────────

export type ISimplexClient = Pick<WebSimplexClient,
  'connect' | 'disconnect' | 'createQueue' | 'subscribeToQueue' |
  'sendMessage' | 'acknowledgeMessage' | 'createInvitation' | 'acceptInvitation' |
  'onMessage' | 'onStateChange' | 'getState' | 'setProxy'
>;

class SmartSimplexClient implements ISimplexClient {
  private relay = new LocalRelayClient();
  private smp = new WebSimplexClient();
  private impl: ISimplexClient = this.smp;

  async connect(servers?: string[]): Promise<void> {
    try {
      await this.relay.connect();
      this.impl = this.relay;
      console.log('[simplex] Using local relay at', relayUrl());
    } catch {
      await this.smp.connect(servers);
      this.impl = this.smp;
      console.log('[simplex] Using public SMP servers');
    }
  }

  disconnect() { return this.impl.disconnect(); }
  createQueue() { return (this.impl as WebSimplexClient).createQueue(); }
  subscribeToQueue(a: SMPQueueAddress) { return (this.impl as WebSimplexClient).subscribeToQueue(a); }
  sendMessage(a: SMPQueueAddress, m: Uint8Array) { return this.impl.sendMessage(a, m); }
  acknowledgeMessage(a: SMPQueueAddress, id: Uint8Array) { return this.impl.acknowledgeMessage(a, id); }
  createInvitation(d: string, k: Uint8Array) { return this.impl.createInvitation(d, k); }
  acceptInvitation(inv: SMPInvitation) { return this.impl.acceptInvitation(inv); }
  onMessage(cb: MessageCallback) { return this.impl.onMessage(cb); }
  onStateChange(cb: StateCallback) { return this.impl.onStateChange(cb); }
  getState() { return this.impl.getState(); }
  setProxy(url: string | null) { return this.impl.setProxy(url); }
}

// Singleton instance
export const simplexClient = new SmartSimplexClient();
