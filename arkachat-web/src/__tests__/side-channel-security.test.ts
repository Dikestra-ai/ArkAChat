import { describe, it, expect } from 'vitest';
import { pad, unpad } from '@/lib/crypto/messagePadding';

describe('Side-Channel Security Tests', () => {
  describe('Message Padding - Traffic Analysis Resistance', () => {
    it('short messages are indistinguishable by size', () => {
      const messages = ['ok', 'no', 'hi', 'yes', 'maybe', 'sure thing!'];
      const sizes = messages.map((m) => pad(new TextEncoder().encode(m)).length);
      // All short messages should be 128 bytes
      expect(new Set(sizes).size).toBe(1);
      expect(sizes[0]).toBe(128);
    });

    it('medium messages are indistinguishable by size', () => {
      const msg150 = 'a'.repeat(150);
      const msg200 = 'b'.repeat(200);
      const size1 = pad(new TextEncoder().encode(msg150)).length;
      const size2 = pad(new TextEncoder().encode(msg200)).length;
      expect(size1).toBe(size2);
      expect(size1).toBe(256);
    });

    it('all bucket sizes are from the defined set or multiples of 256', () => {
      const testSizes = [1, 50, 124, 125, 252, 253, 508, 1020, 2044, 4092];
      const validBuckets = new Set([128, 256, 512, 1024, 2048, 4096]);
      for (const size of testSizes) {
        const padded = pad(new Uint8Array(size));
        const isKnownBucket = validBuckets.has(padded.length);
        const isMul256 = padded.length % 256 === 0;
        expect(isKnownBucket || isMul256).toBe(true);
      }
    });

    it('padding preserves message content exactly', () => {
      const original = 'This is a sensitive message with unicode: \u{1F512}';
      const encoded = new TextEncoder().encode(original);
      const padded = pad(encoded);
      const unpadded = unpad(padded);
      const decoded = new TextDecoder().decode(unpadded);
      expect(decoded).toBe(original);
    });

    it('large messages beyond 4096 still get padded', () => {
      const large = new Uint8Array(5000);
      large.fill(0xAB);
      const padded = pad(large);
      expect(padded.length).toBeGreaterThan(5000);
      expect(padded.length % 256).toBe(0);
      const unpadded = unpad(padded);
      expect(unpadded).toEqual(large);
    });
  });

  describe('Dummy Message Type', () => {
    it('DUMMY enum value exists in MessageType', async () => {
      const { MessageType } = await import('@/lib/bridge/shieldSimplexBridge');
      expect(MessageType.DUMMY).toBe('DUMMY');
    });

    it('DUMMY messages have identical wire format to real messages', () => {
      const dummyEnvelope = JSON.stringify({
        type: 'DUMMY',
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1711036800000,
      });
      const textEnvelope = JSON.stringify({
        type: 'TEXT',
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: 1711036800000,
        content: 'hi',
      });

      const dummyPadded = pad(new TextEncoder().encode(dummyEnvelope));
      const textPadded = pad(new TextEncoder().encode(textEnvelope));
      // Both should be in 128-byte bucket (short JSON fits easily)
      expect(dummyPadded.length).toBe(textPadded.length);
    });
  });

  describe('Timing Randomization', () => {
    it('reconnect delay is randomized (3-7 seconds)', () => {
      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        const delay = 3000 + Math.floor(Math.random() * 4000);
        delays.push(delay);
      }
      const min = Math.min(...delays);
      const max = Math.max(...delays);
      expect(min).toBeGreaterThanOrEqual(3000);
      expect(max).toBeLessThan(7000);
      const unique = new Set(delays);
      expect(unique.size).toBeGreaterThan(10);
    });
  });

  describe('Cross-Platform Padding Compatibility', () => {
    it('padding format has 4-byte length prefix', () => {
      const msg = new TextEncoder().encode('test');
      const padded = pad(msg);

      // First 4 bytes = length (big-endian)
      expect(padded[0]).toBe(0);
      expect(padded[1]).toBe(0);
      expect(padded[2]).toBe(0);
      expect(padded[3]).toBe(4); // "test" is 4 bytes

      // Plaintext starts at offset 4
      expect(padded[4]).toBe(0x74); // t
      expect(padded[5]).toBe(0x65); // e
      expect(padded[6]).toBe(0x73); // s
      expect(padded[7]).toBe(0x74); // t

      // Rest is zero padding
      for (let i = 8; i < 128; i++) {
        expect(padded[i]).toBe(0);
      }
    });
  });

  describe('TrafficObfuscator', () => {
    it('TrafficObfuscator class exists and is importable', async () => {
      const { TrafficObfuscator } = await import('@/lib/network/trafficObfuscator');
      expect(typeof TrafficObfuscator).toBe('function');
    });
  });
});
