/**
 * Shield-SimpleX Bridge
 *
 * Connects Shield encryption with SimpleX messaging.
 * - Encrypts messages with Shield before sending via SimpleX
 * - Decrypts messages received from SimpleX with Shield
 * - Handles QR-based contact pairing
 * - Manages encrypted file transfers
 */

import { WebShieldCrypto, shieldCrypto, QRExchange, Shield } from '../shield/crypto';
import {
  WebSimplexClient,
  simplexClient,
  SMPQueueAddress,
  SMPMessage,
  SMPInvitation,
  encodeQueueUri,
  decodeQueueUri,
  encodeInvitation,
  decodeInvitation,
  ConnectionState,
} from '../simplex/client';
import {
  EncryptedFileStorage,
  EncryptedFileRef,
  FileMetadata,
  createEncryptedFileStorage,
} from '../storage/encryptedFileStorage';
import { useChatStore, Contact, Message, MessageStatus } from '../storage/chatStore';
import {
  useGroupStore,
  Group,
  GroupMember,
  GroupMessage,
  GroupMessageEnvelope,
  GroupMessageType,
} from '../storage/groupStore';
import { GroupKeyManager, groupKeyManager } from '../crypto/groupKeyManager';

/**
 * Message types for the envelope.
 */
export enum MessageType {
  TEXT = 'TEXT',
  FILE = 'FILE',
  FILE_REQUEST = 'FILE_REQUEST',
  FILE_DATA = 'FILE_DATA',
  DELIVERY_RECEIPT = 'DELIVERY_RECEIPT',
  READ_RECEIPT = 'READ_RECEIPT',
  TYPING = 'TYPING',
}

/**
 * Message envelope for Shield-encrypted messages over SimpleX.
 */
export interface MessageEnvelope {
  type: MessageType;
  messageId: string;
  timestamp: number;
  content?: string;
  fileId?: string;
  fileMetadata?: {
    name: string;
    mimeType: string;
    size: number;
  };
  fileData?: string; // Base64 encoded encrypted file
  replyToId?: string;
}

/**
 * Invitation data for QR code pairing.
 */
export interface PairingInvitation {
  simplexUri: string;
  shieldKey: Uint8Array;
  displayName: string;
  timestamp: number;
}

type MessageCallback = (message: Message) => void;
type ConnectionCallback = (state: ConnectionState) => void;

/**
 * Bridge connecting Shield encryption with SimpleX messaging.
 * Supports both 1:1 and group messaging.
 */
export class ShieldSimplexBridge {
  private crypto: WebShieldCrypto;
  private simplex: WebSimplexClient;
  private fileStorage: EncryptedFileStorage;
  private groupKeys: GroupKeyManager;

  private contactQueues = new Map<string, SMPQueueAddress>();
  private pendingInvitations = new Map<string, PairingInvitation>();

  private messageCallbacks = new Set<MessageCallback>();
  private connectionCallbacks = new Set<ConnectionCallback>();

  private unsubscribeMessages: (() => void) | null = null;
  private unsubscribeState: (() => void) | null = null;

  constructor(
    crypto?: WebShieldCrypto,
    simplex?: WebSimplexClient,
    fileStorage?: EncryptedFileStorage,
    groupKeys?: GroupKeyManager
  ) {
    this.crypto = crypto ?? shieldCrypto;
    this.simplex = simplex ?? simplexClient;
    this.groupKeys = groupKeys ?? groupKeyManager;
    this.fileStorage = fileStorage ?? createEncryptedFileStorage({
      getKey: async (keyId) => {
        // Access keys from the crypto store
        const db = await this.openKeyStore();
        const record = await db.get('keys', keyId);
        return record ? new Uint8Array(record.key) : null;
      },
    });
  }

  /**
   * Initialize the bridge - connect to SimpleX and start listening.
   */
  async initialize(): Promise<void> {
    // Connect to SMP servers
    await this.simplex.connect();

    // Subscribe to incoming messages
    this.unsubscribeMessages = this.simplex.onMessage((smpMessage) => {
      this.handleIncomingMessage(smpMessage);
    });

    // Forward connection state
    this.unsubscribeState = this.simplex.onStateChange((state) => {
      this.connectionCallbacks.forEach((cb) => cb(state));
    });
  }

  /**
   * Shutdown the bridge.
   */
  shutdown(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeState?.();
    this.simplex.disconnect();
  }

  /**
   * Subscribe to connection state changes.
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    callback(this.simplex.getState());
    return () => this.connectionCallbacks.delete(callback);
  }

  /**
   * Subscribe to incoming messages.
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  // ==================== Contact Pairing ====================

  /**
   * Create an invitation for a new contact (generates QR code data).
   */
  async createInvitation(displayName: string): Promise<string> {
    // Generate a temporary contact ID for the pending invitation
    const tempContactId = `pending_${crypto.randomUUID()}`;

    // Generate Shield shared key
    const shieldKey = await this.crypto.generateSharedKey(tempContactId);

    // Create SimpleX invitation
    const invitation = await this.simplex.createInvitation(displayName, shieldKey);

    // Store pending invitation for later completion
    this.pendingInvitations.set(tempContactId, {
      simplexUri: invitation.connReqUri,
      shieldKey,
      displayName,
      timestamp: Date.now(),
    });

    return encodeInvitation(invitation);
  }

  /**
   * Get QR code data as a data URL for display.
   */
  async getInvitationQRCode(displayName: string): Promise<{ data: string; qrString: string }> {
    const qrString = await this.createInvitation(displayName);

    // In production, use a QR code library like qrcode
    // For now, return the raw data
    return { data: qrString, qrString };
  }

  /**
   * Accept an invitation from a scanned QR code.
   */
  async acceptInvitation(qrData: string): Promise<Contact> {
    const invitation = decodeInvitation(qrData);
    if (!invitation) {
      throw new Error('Invalid invitation QR code');
    }

    // Accept SimpleX connection
    const queue = await this.simplex.acceptInvitation(invitation);

    // Generate contact ID
    const contactId = crypto.randomUUID();

    // Import Shield key for E2E encryption
    await this.crypto.importSharedKey(contactId, invitation.shieldKey);

    // Create contact
    const contact: Contact = {
      id: contactId,
      displayName: invitation.displayName,
      simplexQueueUri: encodeQueueUri(queue),
      isInitiator: false,
      createdAt: Date.now(),
      lastMessageAt: undefined,
    };

    // Save contact to store
    useChatStore.getState().addContact(contact);

    // Cache queue mapping
    this.contactQueues.set(contactId, queue);

    return contact;
  }

  // ==================== Messaging ====================

  /**
   * Send a text message to a contact.
   */
  async sendTextMessage(contactId: string, text: string): Promise<Message> {
    const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const messageId = crypto.randomUUID();
    const timestamp = Date.now();

    const envelope: MessageEnvelope = {
      type: MessageType.TEXT,
      messageId,
      timestamp,
      content: text,
    };

    // Encrypt with Shield
    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.crypto.encryptMessage(
      contactId,
      contact.isInitiator,
      envelopeJson
    );

    // Send via SimpleX
    const queue = await this.getQueueForContact(contact);
    await this.simplex.sendMessage(queue, encrypted);

    // Create and save message
    const message: Message = {
      id: messageId,
      contactId,
      content: text,
      isOutgoing: true,
      timestamp,
      status: 'sent' as MessageStatus,
    };

    useChatStore.getState().addMessage(message);

    return message;
  }

  /**
   * Send a file to a contact.
   */
  async sendFile(
    contactId: string,
    file: File,
    metadata?: Partial<FileMetadata>
  ): Promise<{ message: Message; fileRef: EncryptedFileRef }> {
    const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    // Encrypt and store file
    const fileRef = await this.fileStorage.saveEncrypted(contactId, file, metadata);

    const messageId = crypto.randomUUID();
    const timestamp = Date.now();

    const envelope: MessageEnvelope = {
      type: MessageType.FILE,
      messageId,
      timestamp,
      fileId: fileRef.id,
      fileMetadata: {
        name: metadata?.originalName ?? file.name,
        mimeType: (metadata?.mimeType ?? file.type) || 'application/octet-stream',
        size: file.size,
      },
    };

    // Encrypt envelope with Shield
    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.crypto.encryptMessage(
      contactId,
      contact.isInitiator,
      envelopeJson
    );

    // Send via SimpleX
    const queue = await this.getQueueForContact(contact);
    await this.simplex.sendMessage(queue, encrypted);

    // Create and save message
    const message: Message = {
      id: messageId,
      contactId,
      content: `[File: ${envelope.fileMetadata!.name}]`,
      fileId: fileRef.id,
      isOutgoing: true,
      timestamp,
      status: 'sent' as MessageStatus,
    };

    useChatStore.getState().addMessage(message);

    return { message, fileRef };
  }

  /**
   * Send an encrypted file to a contact (file already encrypted).
   */
  async sendEncryptedFile(
    contactId: string,
    encryptedData: Uint8Array,
    metadata: FileMetadata
  ): Promise<{ message: Message; fileRef: EncryptedFileRef }> {
    const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    // Import the encrypted file
    const fileRef = await this.fileStorage.importEncrypted(contactId, encryptedData);

    const messageId = crypto.randomUUID();
    const timestamp = Date.now();

    // For small files, embed the encrypted data
    // For large files, send a file reference and let recipient request download
    const isSmallFile = encryptedData.length < 64 * 1024; // 64KB threshold

    const envelope: MessageEnvelope = {
      type: isSmallFile ? MessageType.FILE_DATA : MessageType.FILE,
      messageId,
      timestamp,
      fileId: fileRef.id,
      fileMetadata: {
        name: metadata.originalName,
        mimeType: metadata.mimeType,
        size: metadata.originalSize,
      },
      fileData: isSmallFile ? this.uint8ArrayToBase64(encryptedData) : undefined,
    };

    // Encrypt envelope with Shield
    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.crypto.encryptMessage(
      contactId,
      contact.isInitiator,
      envelopeJson
    );

    // Send via SimpleX
    const queue = await this.getQueueForContact(contact);
    await this.simplex.sendMessage(queue, encrypted);

    // Create and save message
    const message: Message = {
      id: messageId,
      contactId,
      content: `[File: ${metadata.originalName}]`,
      fileId: fileRef.id,
      isOutgoing: true,
      timestamp,
      status: 'sent' as MessageStatus,
    };

    useChatStore.getState().addMessage(message);

    return { message, fileRef };
  }

  /**
   * Request to download an encrypted file from a contact.
   */
  async requestFileDownload(contactId: string, fileId: string): Promise<void> {
    const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    const envelope: MessageEnvelope = {
      type: MessageType.FILE_REQUEST,
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      fileId,
    };

    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.crypto.encryptMessage(
      contactId,
      contact.isInitiator,
      envelopeJson
    );

    const queue = await this.getQueueForContact(contact);
    await this.simplex.sendMessage(queue, encrypted);
  }

  /**
   * Send delivery receipt for a message.
   */
  async sendDeliveryReceipt(contactId: string, messageId: string): Promise<void> {
    const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
    if (!contact) return;

    const envelope: MessageEnvelope = {
      type: MessageType.DELIVERY_RECEIPT,
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      replyToId: messageId,
    };

    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.crypto.encryptMessage(
      contactId,
      contact.isInitiator,
      envelopeJson
    );

    const queue = await this.getQueueForContact(contact);
    await this.simplex.sendMessage(queue, encrypted);
  }

  /**
   * Send read receipt for a message.
   */
  async sendReadReceipt(contactId: string, messageId: string): Promise<void> {
    const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
    if (!contact) return;

    const envelope: MessageEnvelope = {
      type: MessageType.READ_RECEIPT,
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      replyToId: messageId,
    };

    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.crypto.encryptMessage(
      contactId,
      contact.isInitiator,
      envelopeJson
    );

    const queue = await this.getQueueForContact(contact);
    await this.simplex.sendMessage(queue, encrypted);
  }

  /**
   * Send read receipt for a group message.
   * Sends to the original sender via their pairwise channel.
   */
  async sendGroupReadReceipt(groupId: string, messageId: string): Promise<void> {
    const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
    if (!group) return;

    // Find the original message to get the sender
    const messages = useGroupStore.getState().getGroupMessages(groupId);
    const originalMessage = messages.find((m) => m.id === messageId);
    if (!originalMessage || !originalMessage.senderContactId) return;

    // Get the sender's contact info
    const senderContact = useChatStore.getState().contacts.find(
      (c) => c.id === originalMessage.senderContactId
    );
    if (!senderContact) return;

    // Create group read receipt envelope
    const envelope: GroupMessageEnvelope = {
      type: 'READ_RECEIPT',
      groupId,
      senderId: '', // Self
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      keyId: group.currentKeyId,
      replyToId: messageId,
    };

    // Encrypt with group key
    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.groupKeys.encryptGroupMessage(
      groupId,
      new TextEncoder().encode(envelopeJson)
    );

    // Send via pairwise channel to the sender
    const pairwiseEnvelope: MessageEnvelope = {
      type: MessageType.TEXT,
      messageId: envelope.messageId,
      timestamp: envelope.timestamp,
      content: `GROUP:${groupId}:${group.currentKeyId}:${this.uint8ArrayToBase64(encrypted)}`,
    };

    const pairwiseJson = JSON.stringify(pairwiseEnvelope);
    const pairwiseEncrypted = await this.crypto.encryptMessage(
      senderContact.id,
      senderContact.isInitiator,
      pairwiseJson
    );

    const queue = await this.getQueueForContact(senderContact);
    await this.simplex.sendMessage(queue, pairwiseEncrypted);
  }

  // ==================== File Downloads ====================

  /**
   * Download a file in decrypted form (for viewing).
   */
  async downloadFileDecrypted(fileRef: EncryptedFileRef): Promise<Blob> {
    return this.fileStorage.downloadDecrypted(fileRef);
  }

  /**
   * Download a file in encrypted form (for backup/transfer).
   */
  async downloadFileEncrypted(fileRef: EncryptedFileRef): Promise<Blob> {
    return this.fileStorage.downloadEncrypted(fileRef);
  }

  /**
   * Trigger browser download of decrypted file.
   */
  async triggerDecryptedDownload(fileRef: EncryptedFileRef): Promise<void> {
    return this.fileStorage.triggerDecryptedDownload(fileRef);
  }

  /**
   * Trigger browser download of encrypted file.
   */
  async triggerEncryptedDownload(fileRef: EncryptedFileRef): Promise<void> {
    return this.fileStorage.triggerEncryptedDownload(fileRef);
  }

  // ==================== Private Helpers ====================

  private async handleIncomingMessage(smpMessage: SMPMessage): Promise<void> {
    // Find contact by queue
    const contact = this.findContactByQueue(smpMessage.queueAddress);
    if (!contact) {
      console.warn('Message from unknown sender');
      return;
    }

    try {
      // Decrypt with Shield
      const decrypted = await this.crypto.decryptMessage(
        contact.id,
        contact.isInitiator,
        smpMessage.ciphertext
      );

      // Parse envelope
      const envelope: MessageEnvelope = JSON.parse(decrypted);

      // Handle based on type
      switch (envelope.type) {
        case MessageType.TEXT:
          await this.handleTextMessage(contact, envelope);
          break;
        case MessageType.FILE:
          await this.handleFileMessage(contact, envelope);
          break;
        case MessageType.FILE_DATA:
          await this.handleFileDataMessage(contact, envelope);
          break;
        case MessageType.FILE_REQUEST:
          await this.handleFileRequest(contact, envelope);
          break;
        case MessageType.DELIVERY_RECEIPT:
          this.handleDeliveryReceipt(envelope);
          break;
        case MessageType.READ_RECEIPT:
          this.handleReadReceipt(envelope);
          break;
        case MessageType.TYPING:
          // Handle typing indicator
          break;
      }

      // Acknowledge message
      await this.simplex.acknowledgeMessage(smpMessage.queueAddress, smpMessage.msgId);

      // Send delivery receipt for content messages
      if (envelope.type === MessageType.TEXT || envelope.type === MessageType.FILE) {
        await this.sendDeliveryReceipt(contact.id, envelope.messageId);
      }
    } catch (error) {
      console.error('Failed to process incoming message:', error);
    }
  }

  private async handleTextMessage(contact: Contact, envelope: MessageEnvelope): Promise<void> {
    const content = envelope.content ?? '';

    // Check for group-related messages
    // Format: GROUP:groupId:keyId:base64_encrypted
    if (content.startsWith('GROUP:')) {
      const parts = content.substring(6).split(':', 3);
      if (parts.length === 3) {
        const [groupId, keyId, base64Encrypted] = parts;
        await this.handleGroupMessage(contact, groupId, keyId, base64Encrypted);
        return;
      }
    }

    // Format: GROUP_KEY:json_data
    if (content.startsWith('GROUP_KEY:')) {
      await this.handleGroupKeyDistribution(contact, content.substring(10));
      return;
    }

    // Regular 1:1 text message
    const message: Message = {
      id: envelope.messageId,
      contactId: contact.id,
      content,
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered' as MessageStatus,
    };

    useChatStore.getState().addMessage(message);
    this.messageCallbacks.forEach((cb) => cb(message));
  }

  private async handleFileMessage(contact: Contact, envelope: MessageEnvelope): Promise<void> {
    // File reference only - content will be requested separately
    const message: Message = {
      id: envelope.messageId,
      contactId: contact.id,
      content: `[File: ${envelope.fileMetadata?.name ?? 'Unknown'}]`,
      fileId: envelope.fileId,
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered' as MessageStatus,
    };

    useChatStore.getState().addMessage(message);
    this.messageCallbacks.forEach((cb) => cb(message));
  }

  private async handleFileDataMessage(contact: Contact, envelope: MessageEnvelope): Promise<void> {
    // File data embedded in message
    if (!envelope.fileData || !envelope.fileMetadata) {
      return;
    }

    const encryptedData = this.base64ToUint8Array(envelope.fileData);

    // Import and store the encrypted file
    const fileRef = await this.fileStorage.importEncrypted(
      contact.id,
      encryptedData,
      envelope.fileId
    );

    const message: Message = {
      id: envelope.messageId,
      contactId: contact.id,
      content: `[File: ${envelope.fileMetadata.name}]`,
      fileId: fileRef.id,
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered' as MessageStatus,
    };

    useChatStore.getState().addMessage(message);
    this.messageCallbacks.forEach((cb) => cb(message));
  }

  private async handleFileRequest(contact: Contact, envelope: MessageEnvelope): Promise<void> {
    const fileId = envelope.fileId;
    if (!fileId) return;

    try {
      // Get encrypted file and send it
      const fileRef: EncryptedFileRef = {
        id: fileId,
        contactId: contact.id,
        encryptedSize: 0,
      };

      const encryptedBlob = await this.fileStorage.downloadEncrypted(fileRef);
      const encryptedData = new Uint8Array(await encryptedBlob.arrayBuffer());

      // Send file data
      const responseEnvelope: MessageEnvelope = {
        type: MessageType.FILE_DATA,
        messageId: crypto.randomUUID(),
        timestamp: Date.now(),
        fileId,
        fileData: this.uint8ArrayToBase64(encryptedData),
      };

      const envelopeJson = JSON.stringify(responseEnvelope);
      const encrypted = await this.crypto.encryptMessage(
        contact.id,
        contact.isInitiator,
        envelopeJson
      );

      const queue = await this.getQueueForContact(contact);
      await this.simplex.sendMessage(queue, encrypted);
    } catch (error) {
      console.error('Failed to send requested file:', error);
    }
  }

  private handleDeliveryReceipt(envelope: MessageEnvelope): void {
    if (envelope.replyToId) {
      useChatStore.getState().updateMessageStatus(envelope.replyToId, 'delivered');
    }
  }

  private handleReadReceipt(envelope: MessageEnvelope): void {
    if (envelope.replyToId) {
      useChatStore.getState().updateMessageStatus(envelope.replyToId, 'read');
    }
  }

  private findContactByQueue(queue: SMPQueueAddress): Contact | undefined {
    const queueUri = encodeQueueUri(queue);
    return useChatStore.getState().contacts.find((c) => c.simplexQueueUri === queueUri);
  }

  private async getQueueForContact(contact: Contact): Promise<SMPQueueAddress> {
    // Check cache
    const cached = this.contactQueues.get(contact.id);
    if (cached) return cached;

    // Parse from stored URI
    const queue = decodeQueueUri(contact.simplexQueueUri);
    if (!queue) {
      throw new Error(`Invalid queue URI for contact: ${contact.id}`);
    }

    this.contactQueues.set(contact.id, queue);
    return queue;
  }

  private uint8ArrayToBase64(data: Uint8Array): string {
    return btoa(String.fromCharCode(...data));
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private async openKeyStore(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('chatguard-shield', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ==================== Group Messaging ====================

  /**
   * Create a new group with initial members.
   */
  async createGroup(name: string, memberContactIds: string[]): Promise<Group> {
    const groupId = crypto.randomUUID();

    // Generate group key
    const groupKey = await this.groupKeys.createGroupKey(groupId);

    // Create group
    const group: Group = {
      id: groupId,
      name,
      createdAt: Date.now(),
      createdBy: '', // Empty = self
      currentKeyId: groupKey.id,
      keyRotationCount: 0,
    };

    // Create member list (self + invited members)
    const members: GroupMember[] = [];

    // Add self as admin
    members.push({
      groupId,
      contactId: '', // Empty = self
      displayName: 'You',
      role: 'admin',
      joinedAt: Date.now(),
      addedBy: '',
    });

    // Add invited members
    for (const contactId of memberContactIds) {
      const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
      if (!contact) continue;

      members.push({
        groupId,
        contactId,
        displayName: contact.displayName,
        role: 'member',
        joinedAt: Date.now(),
        addedBy: '',
      });
    }

    // Save to store
    useGroupStore.getState().addGroup(group);
    useGroupStore.getState().setMembers(groupId, members);

    // Distribute group key to all members
    const decryptedKey = await this.groupKeys.getDecryptedCurrentKey(groupId);
    if (decryptedKey) {
      await this.distributeGroupKey(groupId, decryptedKey, groupKey.id, members, 0);
    }

    return group;
  }

  /**
   * Send a text message to a group.
   */
  async sendGroupMessage(groupId: string, text: string): Promise<GroupMessage> {
    const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const messageId = crypto.randomUUID();
    const timestamp = Date.now();

    // Create group message envelope
    const envelope: GroupMessageEnvelope = {
      type: 'TEXT',
      groupId,
      senderId: '', // Empty = self
      messageId,
      timestamp,
      keyId: group.currentKeyId,
      content: text,
    };

    // Encrypt with group key
    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.groupKeys.encryptGroupMessage(
      groupId,
      new TextEncoder().encode(envelopeJson)
    );

    // Send to all members via their pairwise channels
    const members = useGroupStore.getState().members[groupId] || [];
    for (const member of members) {
      if (member.contactId === '') continue; // Skip self

      const contact = useChatStore.getState().contacts.find((c) => c.id === member.contactId);
      if (!contact) continue;

      // Wrap in pairwise envelope and send
      // Format: GROUP:groupId:keyId:base64_encrypted
      const pairwiseEnvelope: MessageEnvelope = {
        type: MessageType.TEXT,
        messageId,
        timestamp,
        content: `GROUP:${groupId}:${group.currentKeyId}:${this.uint8ArrayToBase64(encrypted)}`,
      };

      const pairwiseJson = JSON.stringify(pairwiseEnvelope);
      const pairwiseEncrypted = await this.crypto.encryptMessage(
        member.contactId,
        contact.isInitiator,
        pairwiseJson
      );

      const queue = await this.getQueueForContact(contact);
      await this.simplex.sendMessage(queue, pairwiseEncrypted);
    }

    // Save message locally
    const message: GroupMessage = {
      id: messageId,
      contactId: '', // Empty for group messages
      groupId,
      senderContactId: undefined, // undefined = self
      content: text,
      isOutgoing: true,
      timestamp,
      status: 'sent',
    };

    useGroupStore.getState().addGroupMessage(message);

    return message;
  }

  /**
   * Check if the current user is an admin in the specified group.
   */
  isAdmin(groupId: string): boolean {
    const members = useGroupStore.getState().members[groupId] || [];
    const selfMember = members.find((m) => m.contactId === '');
    return selfMember?.role === 'admin';
  }

  /**
   * Add a member to an existing group.
   * Requires admin permission.
   */
  async addGroupMember(groupId: string, contactId: string): Promise<GroupMember> {
    // Check admin permission
    if (!this.isAdmin(groupId)) {
      throw new Error('Only admins can add members to the group');
    }

    const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    const contact = useChatStore.getState().contacts.find((c) => c.id === contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    // Create member
    const member: GroupMember = {
      groupId,
      contactId,
      displayName: contact.displayName,
      role: 'member',
      joinedAt: Date.now(),
      addedBy: '', // Self
    };

    useGroupStore.getState().addMember(member);

    // Send current group key to new member
    const decryptedKey = await this.groupKeys.getDecryptedCurrentKey(groupId);
    if (decryptedKey) {
      const encryptedKey = await this.groupKeys.encryptKeyForMember(
        decryptedKey,
        contactId,
        contact.isInitiator
      );

      // Send key distribution message
      await this.sendGroupKeyToMember(
        contact,
        groupId,
        group.name,
        encryptedKey,
        group.currentKeyId,
        group.keyRotationCount
      );
    }

    // Notify other members
    await this.sendGroupSystemMessage(groupId, 'MEMBER_ADDED', { memberId: contactId });

    return member;
  }

  /**
   * Remove a member from a group (with key rotation).
   * Requires admin permission.
   */
  async removeGroupMember(groupId: string, contactId: string): Promise<void> {
    // Check admin permission
    if (!this.isAdmin(groupId)) {
      throw new Error('Only admins can remove members from the group');
    }

    const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
    if (!group) {
      throw new Error(`Group not found: ${groupId}`);
    }

    // Generate new key
    const newKey = await this.groupKeys.rotateKey(group);

    // Remove member
    useGroupStore.getState().removeMember(groupId, contactId);

    // Update group with new key
    useGroupStore.getState().updateGroup(groupId, {
      currentKeyId: newKey.id,
      keyRotationCount: newKey.rotationNumber,
    });

    // Distribute new key to remaining members
    const members = useGroupStore.getState().members[groupId] || [];
    const decryptedKey = await this.groupKeys.getDecryptedCurrentKey(groupId);
    if (decryptedKey) {
      await this.distributeGroupKey(groupId, decryptedKey, newKey.id, members, newKey.rotationNumber);
    }

    // Notify members of removal
    await this.sendGroupSystemMessage(groupId, 'MEMBER_REMOVED', { memberId: contactId });
  }

  /**
   * Leave a group voluntarily.
   */
  async leaveGroup(groupId: string): Promise<void> {
    // Notify other members
    await this.sendGroupSystemMessage(groupId, 'MEMBER_REMOVED', { memberId: '' });

    // Remove group from local store
    useGroupStore.getState().removeGroup(groupId);
  }

  /**
   * Update group name.
   * Requires admin permission.
   */
  async updateGroupName(groupId: string, newName: string): Promise<void> {
    // Check admin permission
    if (!this.isAdmin(groupId)) {
      throw new Error('Only admins can update group settings');
    }

    useGroupStore.getState().updateGroup(groupId, { name: newName });

    // Notify all members
    await this.sendGroupSystemMessage(groupId, 'GROUP_INFO_UPDATE', { name: newName });
  }

  /**
   * Update group avatar.
   * Requires admin permission.
   */
  async updateGroupAvatar(groupId: string, avatarUrl: string | undefined): Promise<void> {
    // Check admin permission
    if (!this.isAdmin(groupId)) {
      throw new Error('Only admins can update group settings');
    }

    useGroupStore.getState().updateGroup(groupId, { avatarUrl });

    // Notify all members
    await this.sendGroupSystemMessage(groupId, 'GROUP_INFO_UPDATE', {
      avatarUrl: avatarUrl ?? '',
    });
  }

  /**
   * Promote a member to admin.
   * Requires admin permission.
   */
  async promoteToAdmin(groupId: string, contactId: string): Promise<void> {
    // Check admin permission
    if (!this.isAdmin(groupId)) {
      throw new Error('Only admins can promote members');
    }

    useGroupStore.getState().updateMemberRole(groupId, contactId, 'admin');

    // Notify all members
    await this.sendGroupSystemMessage(groupId, 'ADMIN_CHANGE', {
      memberId: contactId,
      role: 'admin',
    });
  }

  /**
   * Demote an admin to regular member.
   * Requires admin permission.
   */
  async demoteToMember(groupId: string, contactId: string): Promise<void> {
    // Check admin permission
    if (!this.isAdmin(groupId)) {
      throw new Error('Only admins can demote members');
    }

    // Cannot demote self if you're the only admin
    const members = useGroupStore.getState().members[groupId] || [];
    const admins = members.filter((m) => m.role === 'admin');
    if (admins.length <= 1 && contactId === '') {
      throw new Error("Cannot demote yourself when you're the only admin");
    }

    useGroupStore.getState().updateMemberRole(groupId, contactId, 'member');

    // Notify all members
    await this.sendGroupSystemMessage(groupId, 'ADMIN_CHANGE', {
      memberId: contactId,
      role: 'member',
    });
  }

  /**
   * Get all groups.
   */
  getGroups(): Group[] {
    return useGroupStore.getState().groups;
  }

  /**
   * Get messages for a group.
   */
  getGroupMessages(groupId: string): GroupMessage[] {
    return useGroupStore.getState().getGroupMessages(groupId);
  }

  /**
   * Get members of a group.
   */
  getGroupMembers(groupId: string): GroupMember[] {
    return useGroupStore.getState().members[groupId] || [];
  }

  // ==================== Private Group Helpers ====================

  private async distributeGroupKey(
    groupId: string,
    groupKey: Uint8Array,
    keyId: string,
    members: GroupMember[],
    rotationNumber: number
  ): Promise<void> {
    const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
    if (!group) return;

    for (const member of members) {
      if (member.contactId === '') continue; // Skip self

      const contact = useChatStore.getState().contacts.find((c) => c.id === member.contactId);
      if (!contact) continue;

      // Encrypt key for this member
      const encryptedKey = await this.groupKeys.encryptKeyForMember(
        groupKey,
        member.contactId,
        contact.isInitiator
      );

      // Send key via pairwise channel
      await this.sendGroupKeyToMember(contact, groupId, group.name, encryptedKey, keyId, rotationNumber);
    }
  }

  private async sendGroupKeyToMember(
    contact: Contact,
    groupId: string,
    groupName: string,
    encryptedKey: Uint8Array,
    keyId: string,
    rotationNumber: number
  ): Promise<void> {
    // Create a special message for key distribution
    const keyData = {
      groupId,
      groupName,
      keyId,
      rotationNumber: rotationNumber.toString(),
      encryptedKey: this.uint8ArrayToBase64(encryptedKey),
    };

    const envelope: MessageEnvelope = {
      type: MessageType.TEXT,
      messageId: crypto.randomUUID(),
      timestamp: Date.now(),
      content: `GROUP_KEY:${JSON.stringify(keyData)}`,
    };

    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.crypto.encryptMessage(
      contact.id,
      contact.isInitiator,
      envelopeJson
    );

    const queue = await this.getQueueForContact(contact);
    await this.simplex.sendMessage(queue, encrypted);
  }

  private async sendGroupSystemMessage(
    groupId: string,
    type: GroupMessageType,
    metadata: Record<string, string>
  ): Promise<void> {
    const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
    if (!group) return;

    const messageId = crypto.randomUUID();
    const timestamp = Date.now();

    const envelope: GroupMessageEnvelope = {
      type,
      groupId,
      senderId: '',
      messageId,
      timestamp,
      keyId: group.currentKeyId,
      metadata,
    };

    const envelopeJson = JSON.stringify(envelope);
    const encrypted = await this.groupKeys.encryptGroupMessage(
      groupId,
      new TextEncoder().encode(envelopeJson)
    );

    // Send to all members
    const members = useGroupStore.getState().members[groupId] || [];
    for (const member of members) {
      if (member.contactId === '') continue;

      const contact = useChatStore.getState().contacts.find((c) => c.id === member.contactId);
      if (!contact) continue;

      // Format: GROUP:groupId:keyId:base64_encrypted
      const pairwiseEnvelope: MessageEnvelope = {
        type: MessageType.TEXT,
        messageId,
        timestamp,
        content: `GROUP:${groupId}:${group.currentKeyId}:${this.uint8ArrayToBase64(encrypted)}`,
      };

      const pairwiseJson = JSON.stringify(pairwiseEnvelope);
      const pairwiseEncrypted = await this.crypto.encryptMessage(
        member.contactId,
        contact.isInitiator,
        pairwiseJson
      );

      const queue = await this.getQueueForContact(contact);
      await this.simplex.sendMessage(queue, pairwiseEncrypted);
    }
  }

  private async handleGroupMessage(
    contact: Contact,
    groupId: string,
    keyId: string,
    base64Encrypted: string
  ): Promise<void> {
    try {
      // Verify we're a member of this group
      const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
      if (!group) {
        // We might not know about this group yet - could be a race condition
        return;
      }

      // Decode and decrypt the group message
      const encrypted = this.base64ToUint8Array(base64Encrypted);
      const decrypted = await this.groupKeys.decryptGroupMessage(groupId, keyId, encrypted);
      const envelopeJson = new TextDecoder().decode(decrypted);

      // Parse the group message envelope
      const envelope: GroupMessageEnvelope = JSON.parse(envelopeJson);

      // Handle based on message type
      switch (envelope.type) {
        case 'TEXT':
          await this.handleGroupTextMessage(contact, group, envelope);
          break;
        case 'FILE':
          await this.handleGroupFileMessage(contact, group, envelope);
          break;
        case 'MEMBER_ADDED':
          await this.handleMemberAdded(group, envelope);
          break;
        case 'MEMBER_REMOVED':
          await this.handleMemberRemoved(group, envelope);
          break;
        case 'KEY_ROTATION':
          // Already handled via GROUP_KEY: prefix
          break;
        case 'GROUP_INFO_UPDATE':
          await this.handleGroupInfoUpdate(group, envelope);
          break;
        case 'ADMIN_CHANGE':
          await this.handleAdminChange(group, envelope);
          break;
        case 'DELIVERY_RECEIPT':
          this.handleGroupDeliveryReceipt(envelope);
          break;
        case 'READ_RECEIPT':
          this.handleGroupReadReceipt(envelope);
          break;
      }

      // Update group's last message time for content messages
      if (envelope.type === 'TEXT' || envelope.type === 'FILE') {
        useGroupStore.getState().updateGroup(groupId, { lastMessageAt: envelope.timestamp });
      }
    } catch (error) {
      console.error('Failed to handle group message:', error);
    }
  }

  private async handleGroupTextMessage(
    contact: Contact,
    group: Group,
    envelope: GroupMessageEnvelope
  ): Promise<void> {
    const message: GroupMessage = {
      id: envelope.messageId,
      contactId: '', // Empty for group messages
      groupId: group.id,
      senderContactId: contact.id,
      content: envelope.content ?? '',
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered',
    };

    useGroupStore.getState().addGroupMessage(message);
  }

  private async handleGroupFileMessage(
    contact: Contact,
    group: Group,
    envelope: GroupMessageEnvelope
  ): Promise<void> {
    const message: GroupMessage = {
      id: envelope.messageId,
      contactId: '',
      groupId: group.id,
      senderContactId: contact.id,
      content: '[File]',
      fileId: envelope.fileId,
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered',
    };

    useGroupStore.getState().addGroupMessage(message);
  }

  private async handleMemberAdded(group: Group, envelope: GroupMessageEnvelope): Promise<void> {
    const memberId = envelope.metadata?.memberId;
    if (!memberId) return;

    // Check if member already exists
    const existing = useGroupStore.getState().members[group.id]?.find(
      (m) => m.contactId === memberId
    );
    if (existing) return;

    // Get contact info if available
    const contact = useChatStore.getState().contacts.find((c) => c.id === memberId);
    const displayName = contact?.displayName ?? 'Unknown';

    const member: GroupMember = {
      groupId: group.id,
      contactId: memberId,
      displayName,
      role: 'member',
      joinedAt: envelope.timestamp,
      addedBy: envelope.senderId,
    };

    useGroupStore.getState().addMember(member);

    // Insert system message
    const systemMessage: GroupMessage = {
      id: crypto.randomUUID(),
      contactId: '',
      groupId: group.id,
      content: `${displayName} joined the group`,
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered',
    };
    useGroupStore.getState().addGroupMessage(systemMessage);
  }

  private async handleMemberRemoved(group: Group, envelope: GroupMessageEnvelope): Promise<void> {
    const memberId = envelope.metadata?.memberId;
    if (memberId === undefined) return;

    // Get display name before removing
    const member = useGroupStore.getState().members[group.id]?.find(
      (m) => m.contactId === memberId
    );
    const displayName = member?.displayName ?? 'Someone';

    useGroupStore.getState().removeMember(group.id, memberId);

    // Check if self was removed
    const content = memberId === ''
      ? 'You were removed from the group'
      : `${displayName} left the group`;

    // Insert system message
    const systemMessage: GroupMessage = {
      id: crypto.randomUUID(),
      contactId: '',
      groupId: group.id,
      content,
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered',
    };
    useGroupStore.getState().addGroupMessage(systemMessage);
  }

  private async handleGroupInfoUpdate(group: Group, envelope: GroupMessageEnvelope): Promise<void> {
    const newName = envelope.metadata?.name;
    const newAvatar = envelope.metadata?.avatarUrl;

    const updates: Partial<Group> = {};
    if (newName) updates.name = newName;
    if (newAvatar) updates.avatarUrl = newAvatar;

    if (Object.keys(updates).length > 0) {
      useGroupStore.getState().updateGroup(group.id, updates);

      // Insert system message
      const changes: string[] = [];
      if (newName) changes.push(`name to "${newName}"`);
      if (newAvatar) changes.push('avatar');

      const systemMessage: GroupMessage = {
        id: crypto.randomUUID(),
        contactId: '',
        groupId: group.id,
        content: `Group ${changes.join(' and ')} changed`,
        isOutgoing: false,
        timestamp: envelope.timestamp,
        status: 'delivered',
      };
      useGroupStore.getState().addGroupMessage(systemMessage);
    }
  }

  private async handleAdminChange(group: Group, envelope: GroupMessageEnvelope): Promise<void> {
    const memberId = envelope.metadata?.memberId;
    const newRole = envelope.metadata?.role as 'admin' | 'member' | undefined;
    if (!memberId || !newRole) return;

    useGroupStore.getState().updateMemberRole(group.id, memberId, newRole);

    const member = useGroupStore.getState().members[group.id]?.find(
      (m) => m.contactId === memberId
    );
    const displayName = member?.displayName ?? 'Someone';
    const roleText = newRole === 'admin' ? 'an admin' : 'a member';

    const systemMessage: GroupMessage = {
      id: crypto.randomUUID(),
      contactId: '',
      groupId: group.id,
      content: `${displayName} is now ${roleText}`,
      isOutgoing: false,
      timestamp: envelope.timestamp,
      status: 'delivered',
    };
    useGroupStore.getState().addGroupMessage(systemMessage);
  }

  private handleGroupDeliveryReceipt(envelope: GroupMessageEnvelope): void {
    if (envelope.replyToId) {
      useGroupStore.getState().updateGroupMessageStatus(envelope.replyToId, 'delivered');
    }
  }

  private handleGroupReadReceipt(envelope: GroupMessageEnvelope): void {
    if (envelope.replyToId) {
      useGroupStore.getState().updateGroupMessageStatus(envelope.replyToId, 'read');
    }
  }

  private async handleGroupKeyDistribution(contact: Contact, keyDataJson: string): Promise<void> {
    try {
      const keyData = JSON.parse(keyDataJson);

      const groupId = keyData.groupId;
      const groupName = keyData.groupName;
      const keyId = keyData.keyId;
      const rotationNumber = parseInt(keyData.rotationNumber, 10) || 0;
      const encryptedKeyBase64 = keyData.encryptedKey;

      const encryptedKey = this.base64ToUint8Array(encryptedKeyBase64);

      // Decrypt the group key using pairwise session
      const groupKey = await this.groupKeys.decryptKeyFromMember(
        encryptedKey,
        contact.id,
        !contact.isInitiator // We're the receiver
      );

      // Check if group exists
      const existingGroup = useGroupStore.getState().groups.find((g) => g.id === groupId);
      if (!existingGroup) {
        // New group - create it
        const group: Group = {
          id: groupId,
          name: groupName,
          createdAt: Date.now(),
          createdBy: contact.id,
          currentKeyId: keyId,
          keyRotationCount: rotationNumber,
        };

        const selfMember: GroupMember = {
          groupId,
          contactId: '',
          displayName: 'You',
          role: 'member',
          joinedAt: Date.now(),
          addedBy: contact.id,
        };

        const creatorMember: GroupMember = {
          groupId,
          contactId: contact.id,
          displayName: contact.displayName,
          role: 'admin',
          joinedAt: Date.now(),
          addedBy: contact.id,
        };

        // Store key
        await this.groupKeys.storeReceivedKey(groupId, keyId, groupKey, rotationNumber);

        // Create group
        useGroupStore.getState().addGroup(group);
        useGroupStore.getState().setMembers(groupId, [selfMember, creatorMember]);
      } else {
        // Key rotation - update key
        await this.groupKeys.storeReceivedKey(groupId, keyId, groupKey, rotationNumber);
        useGroupStore.getState().updateGroup(groupId, {
          currentKeyId: keyId,
          keyRotationCount: rotationNumber,
        });
      }
    } catch (error) {
      console.error('Failed to handle group key distribution:', error);
    }
  }
}

// Singleton instance
export const bridge = new ShieldSimplexBridge();

// Export for convenience
export { ConnectionState } from '../simplex/client';
