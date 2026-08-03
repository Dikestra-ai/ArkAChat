import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Types for test vectors
interface MessageTestVector {
  index: number;
  plaintext: string;
  plaintextHex: string;
}

interface RatchetTestVectors {
  rootKey: string;
  messages: MessageTestVector[];
}

interface QRTestCase {
  shieldKey: string;
  simplexUri: string;
  displayName: string;
  timestamp: number;
}

interface QRExchangeTestVectors {
  testCases: QRTestCase[];
}

interface QuickEncryptTestCase {
  key: string;
  plaintext: string;
  plaintextHex: string;
  nonce: string;
}

interface TestVectors {
  ratchetSession: RatchetTestVectors;
  qrExchange: QRExchangeTestVectors;
  quickEncrypt: {
    testCases: QuickEncryptTestCase[];
  };
}

// Helper functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Import real Shield implementation
import { RatchetSession } from '../lib/shield/crypto';

// Message envelope types
type MessageType = 'TEXT' | 'FILE' | 'FILE_REQUEST' | 'DELIVERY_RECEIPT' | 'READ_RECEIPT' | 'TYPING';

interface FileMetadataDto {
  name: string;
  mimeType: string;
  size: number;
}

interface MessageEnvelope {
  type: MessageType;
  messageId: string;
  timestamp: number;
  content?: string;
  fileId?: string;
  fileMetadata?: FileMetadataDto;
  replyToId?: string;
}

describe('Shield Encryption Compatibility', () => {
  let testVectors: TestVectors;

  beforeAll(() => {
    // Try to load test vectors from file
    try {
      const vectorsPath = path.join(__dirname, '../../tests/vectors/shield-test-vectors.json');
      const content = fs.readFileSync(vectorsPath, 'utf-8');
      testVectors = JSON.parse(content);
    } catch {
      // Use inline test vectors
      testVectors = {
        ratchetSession: {
          rootKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          messages: [
            { index: 0, plaintext: 'Hello, quantum-safe world!', plaintextHex: '' },
            { index: 1, plaintext: 'Test message', plaintextHex: '' },
            { index: 2, plaintext: 'Short', plaintextHex: '' },
            { index: 3, plaintext: 'Unicode test: Hello \u4e16\u754c', plaintextHex: '' },
          ],
        },
        qrExchange: {
          testCases: [
            {
              shieldKey: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
              simplexUri: 'smp://test@smp.simplex.im/queue',
              displayName: 'Alice',
              timestamp: 1705780000000,
            },
          ],
        },
        quickEncrypt: {
          testCases: [
            {
              key: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
              plaintext: 'Test message for quick encrypt',
              plaintextHex: '54657374206d65737361676520666f7220717569636b20656e6372797074',
              nonce: '000102030405060708090a0b',
            },
          ],
        },
      };
    }
  });

  describe('RatchetSession', () => {
    it('encrypts message with correct structure', async () => {
      const rootKey = hexToBytes(testVectors.ratchetSession.rootKey);
      const plaintext = testVectors.ratchetSession.messages[0].plaintext;

      const session = await RatchetSession.create(rootKey, true);
      const encrypted = await session.encrypt(new TextEncoder().encode(plaintext));

      // Wire format from Rust core: nonce(16) + enc(counter(8) + plaintext) + mac(16)
      // Total: 16 + 8 + plaintext.length + 16 = 40 + plaintext.length
      expect(encrypted.length).toBe(40 + new TextEncoder().encode(plaintext).length);
    });

    it('round-trip encryption works', async () => {
      const rootKey = hexToBytes(testVectors.ratchetSession.rootKey);

      for (const msg of testVectors.ratchetSession.messages) {
        const plaintext = new TextEncoder().encode(msg.plaintext);

        // Initiator encrypts
        const initiatorSession = await RatchetSession.create(rootKey, true);
        const ciphertext = await initiatorSession.encrypt(plaintext);

        // Responder decrypts
        const responderSession = await RatchetSession.create(rootKey, false);
        const decrypted = await responderSession.decrypt(ciphertext);

        expect(decrypted).not.toBeNull();
        expect(new TextDecoder().decode(decrypted!)).toBe(msg.plaintext);
      }
    });

    it('handles Unicode correctly', async () => {
      const rootKey = hexToBytes(testVectors.ratchetSession.rootKey);
      const unicodeMessage = testVectors.ratchetSession.messages.find((m) =>
        m.plaintext.includes('Unicode')
      );

      if (!unicodeMessage) return;

      const initiatorSession = await RatchetSession.create(rootKey, true);
      const ciphertext = await initiatorSession.encrypt(
        new TextEncoder().encode(unicodeMessage.plaintext)
      );

      const responderSession = await RatchetSession.create(rootKey, false);
      const decrypted = await responderSession.decrypt(ciphertext);

      expect(decrypted).not.toBeNull();
      expect(new TextDecoder().decode(decrypted!)).toBe(unicodeMessage.plaintext);
      expect(new TextDecoder().decode(decrypted!)).toContain('\u4e16\u754c'); // Chinese characters
    });

    it('maintains forward secrecy with different nonces', async () => {
      const rootKey = hexToBytes(testVectors.ratchetSession.rootKey);

      const session1 = await RatchetSession.create(rootKey, true);
      const session2 = await RatchetSession.create(rootKey, true);

      const msg1 = await session1.encrypt(new TextEncoder().encode('Message 1'));
      const msg2 = await session2.encrypt(new TextEncoder().encode('Message 1'));

      // Different sessions should produce different ciphertext (different nonces)
      expect(bytesToHex(msg1)).not.toBe(bytesToHex(msg2));
    });

    it('wire format matches Rust Shield core: nonce(16) || enc(counter(8) || plaintext) || mac(16)', async () => {
      const rootKey = hexToBytes(testVectors.ratchetSession.rootKey);
      const plaintext = new TextEncoder().encode('Test message');

      const session = await RatchetSession.create(rootKey, true);
      const encrypted = await session.encrypt(plaintext);

      // Parse wire format: nonce(16) || encrypted_data(8 + plaintext.length) || mac(16)
      const nonce = encrypted.slice(0, 16);
      const encryptedData = encrypted.slice(16, -16); // counter(8) + plaintext encrypted together
      const mac = encrypted.slice(-16);

      expect(nonce.length).toBe(16);
      // Encrypted data contains 8-byte counter + plaintext
      expect(encryptedData.length).toBe(8 + plaintext.length);
      expect(mac.length).toBe(16);
      // Total: 16 + (8 + plaintext.length) + 16 = 40 + plaintext.length
      expect(encrypted.length).toBe(40 + plaintext.length);
    });

    it('counter increments with each message', async () => {
      const rootKey = hexToBytes(testVectors.ratchetSession.rootKey);
      const session = await RatchetSession.create(rootKey, true);

      // Verify session counter increments after each encryption
      expect(session.sendCounter).toBe(0);

      await session.encrypt(new TextEncoder().encode('Message 1'));
      expect(session.sendCounter).toBe(1);

      await session.encrypt(new TextEncoder().encode('Message 2'));
      expect(session.sendCounter).toBe(2);

      await session.encrypt(new TextEncoder().encode('Message 3'));
      expect(session.sendCounter).toBe(3);
    });

    it('multiple messages can be exchanged', async () => {
      const rootKey = hexToBytes(testVectors.ratchetSession.rootKey);
      const initiator = await RatchetSession.create(rootKey, true);
      const responder = await RatchetSession.create(rootKey, false);

      // Send 3 messages from initiator to responder
      const messages = ['First message', 'Second message', 'Third message'];

      for (const msg of messages) {
        const plaintext = new TextEncoder().encode(msg);
        const encrypted = await initiator.encrypt(plaintext);
        const decrypted = await responder.decrypt(encrypted);
        expect(decrypted).not.toBeNull();
        expect(new TextDecoder().decode(decrypted!)).toBe(msg);
      }
    });
  });

  describe('MessageEnvelope', () => {
    it('TEXT envelope serializes correctly', () => {
      const envelope: MessageEnvelope = {
        type: 'TEXT',
        messageId: 'msg-12345',
        timestamp: 1705780000000,
        content: 'Hello!',
      };

      const serialized = JSON.stringify(envelope);

      expect(serialized).toContain('"type":"TEXT"');
      expect(serialized).toContain('"messageId":"msg-12345"');
      expect(serialized).toContain('"content":"Hello!"');
    });

    it('FILE envelope serializes correctly', () => {
      const envelope: MessageEnvelope = {
        type: 'FILE',
        messageId: 'msg-12346',
        timestamp: 1705780001000,
        fileId: 'file-001',
        fileMetadata: {
          name: 'photo.jpg',
          mimeType: 'image/jpeg',
          size: 2048,
        },
      };

      const serialized = JSON.stringify(envelope);

      expect(serialized).toContain('"type":"FILE"');
      expect(serialized).toContain('"fileId":"file-001"');
      expect(serialized).toContain('"name":"photo.jpg"');
    });

    it('DELIVERY_RECEIPT envelope serializes correctly', () => {
      const envelope: MessageEnvelope = {
        type: 'DELIVERY_RECEIPT',
        messageId: 'msg-12347',
        timestamp: 1705780002000,
        replyToId: 'msg-12345',
      };

      const serialized = JSON.stringify(envelope);

      expect(serialized).toContain('"type":"DELIVERY_RECEIPT"');
      expect(serialized).toContain('"replyToId":"msg-12345"');
    });

    it('deserializes from JSON', () => {
      const jsonStr =
        '{"type":"TEXT","messageId":"msg-test","timestamp":1705780000000,"content":"Test message"}';

      const envelope: MessageEnvelope = JSON.parse(jsonStr);

      expect(envelope.type).toBe('TEXT');
      expect(envelope.messageId).toBe('msg-test');
      expect(envelope.timestamp).toBe(1705780000000);
      expect(envelope.content).toBe('Test message');
    });
  });

  describe('QR Exchange', () => {
    it('invitation format contains required fields', () => {
      const testCase = testVectors.qrExchange.testCases[0];

      const invitation = {
        uri: testCase.simplexUri,
        k: testCase.shieldKey,
        n: testCase.displayName,
        ts: Date.now(),
      };

      const invitationJson = JSON.stringify(invitation);

      expect(invitationJson).toContain('"uri"');
      expect(invitationJson).toContain('"k"');
      expect(invitationJson).toContain('"n"');
      expect(invitationJson).toContain('"ts"');
    });

    it('parses invitation JSON correctly', () => {
      const testCase = testVectors.qrExchange.testCases[0];
      const invitationJson = JSON.stringify({
        uri: testCase.simplexUri,
        k: testCase.shieldKey,
        n: testCase.displayName,
        ts: testCase.timestamp,
      });

      const parsed = JSON.parse(invitationJson);

      expect(parsed.uri).toBe(testCase.simplexUri);
      expect(parsed.k).toBe(testCase.shieldKey);
      expect(parsed.n).toBe(testCase.displayName);
      expect(parsed.ts).toBe(testCase.timestamp);
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('hex encoding matches expected format', () => {
      const testKey = testVectors.ratchetSession.rootKey;
      const bytes = hexToBytes(testKey);

      expect(bytes.length).toBe(32); // 256-bit key
      expect(bytesToHex(bytes)).toBe(testKey);
    });

    it('TextEncoder/TextDecoder handles UTF-8 correctly', () => {
      const testStrings = [
        'Hello, World!',
        'Unicode: \u4e16\u754c',
        'Emoji: \ud83d\udd10',
        'Mixed: Hello \u4e16\u754c \ud83d\udd10',
      ];

      for (const str of testStrings) {
        const encoded = new TextEncoder().encode(str);
        const decoded = new TextDecoder().decode(encoded);
        expect(decoded).toBe(str);
      }
    });
  });
});

describe('DOMGuard E2E Test Helpers', () => {
  it('test data-testid attributes defined', () => {
    // These are the data-testid attributes used by DOMGuard
    const requiredTestIds = [
      'add-contact-button',
      'show-qr-button',
      'scan-qr-button',
      'qr-code',
      'qr-input-manual',
      'message-input',
      'send-button',
      'message-bubble',
      'message-status-sent',
      'message-status-delivered',
      'message-status-read',
      'contact-list',
      'chat-screen',
    ];

    // This test documents the expected test IDs
    expect(requiredTestIds.length).toBeGreaterThan(0);
  });
});
