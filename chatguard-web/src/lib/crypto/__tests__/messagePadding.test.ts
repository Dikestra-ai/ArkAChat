import { describe, it, expect } from 'vitest';
import { pad, unpad } from '../messagePadding';

describe('MessagePadding', () => {
  describe('pad', () => {
    it('pads short message to 128 bytes', () => {
      const plaintext = new TextEncoder().encode('ok');
      const padded = pad(plaintext);
      expect(padded.length).toBe(128);
    });

    it('pads 126-byte message to 256 bytes (126 + 4 prefix > 128)', () => {
      const plaintext = new Uint8Array(126);
      plaintext.fill(0x41);
      const padded = pad(plaintext);
      expect(padded.length).toBe(256); // 126 + 4 = 130 > 128
    });

    it('pads to 512 bucket', () => {
      const plaintext = new Uint8Array(257);
      plaintext.fill(0x42);
      const padded = pad(plaintext);
      expect(padded.length).toBe(512); // 257 + 4 = 261, next bucket 512
    });

    it('pads to 1024 bucket', () => {
      const plaintext = new Uint8Array(513);
      plaintext.fill(0x43);
      const padded = pad(plaintext);
      expect(padded.length).toBe(1024);
    });

    it('pads to 2048 bucket', () => {
      const plaintext = new Uint8Array(1025);
      plaintext.fill(0x44);
      const padded = pad(plaintext);
      expect(padded.length).toBe(2048);
    });

    it('pads to 4096 bucket', () => {
      const plaintext = new Uint8Array(2049);
      plaintext.fill(0x45);
      const padded = pad(plaintext);
      expect(padded.length).toBe(4096);
    });

    it('pads beyond 4096 to next multiple of 256', () => {
      const plaintext = new Uint8Array(4097);
      plaintext.fill(0x46);
      const padded = pad(plaintext);
      // 4097 + 4 = 4101, ceil(4101/256)*256 = 4352
      expect(padded.length).toBe(4352);
    });

    it('stores length as big-endian uint32 prefix', () => {
      const plaintext = new TextEncoder().encode('hello'); // 5 bytes
      const padded = pad(plaintext);
      expect(padded[0]).toBe(0);
      expect(padded[1]).toBe(0);
      expect(padded[2]).toBe(0);
      expect(padded[3]).toBe(5);
    });

    it('stores plaintext after 4-byte prefix', () => {
      const plaintext = new TextEncoder().encode('hello');
      const padded = pad(plaintext);
      expect(padded[4]).toBe(0x68); // 'h'
      expect(padded[5]).toBe(0x65); // 'e'
      expect(padded[6]).toBe(0x6C); // 'l'
      expect(padded[7]).toBe(0x6C); // 'l'
      expect(padded[8]).toBe(0x6F); // 'o'
    });

    it('fills remainder with zeros', () => {
      const plaintext = new TextEncoder().encode('hi');
      const padded = pad(plaintext);
      for (let i = 4 + 2; i < 128; i++) {
        expect(padded[i]).toBe(0);
      }
    });

    it('handles message at exact bucket boundary (124 bytes + 4 prefix = 128)', () => {
      const plaintext = new Uint8Array(124);
      plaintext.fill(0x47);
      const padded = pad(plaintext);
      expect(padded.length).toBe(128);
    });

    it('handles 124-byte message that exactly fills 128-byte bucket', () => {
      const plaintext = new Uint8Array(124);
      plaintext.fill(0xFF);
      const padded = pad(plaintext);
      expect(padded.length).toBe(128);
      // Length prefix
      expect(padded[3]).toBe(124);
    });
  });

  describe('unpad', () => {
    it('correctly removes padding', () => {
      const original = new TextEncoder().encode('hello world');
      const padded = pad(original);
      const unpadded = unpad(padded);
      expect(new TextDecoder().decode(unpadded)).toBe('hello world');
      expect(unpadded.length).toBe(original.length);
    });

    it('throws on data shorter than prefix', () => {
      expect(() => unpad(new Uint8Array(3))).toThrow('Padded data too short');
    });

    it('throws on invalid length exceeding data', () => {
      const invalid = new Uint8Array(128);
      // Set length to 200 which exceeds 128 - 4 = 124
      invalid[3] = 200;
      expect(() => unpad(invalid)).toThrow('Invalid plaintext length');
    });
  });

  describe('roundtrip', () => {
    it('roundtrips empty message', () => {
      const original = new Uint8Array(0);
      const result = unpad(pad(original));
      expect(result).toEqual(original);
    });

    it('roundtrips single byte', () => {
      const original = new Uint8Array([42]);
      const result = unpad(pad(original));
      expect(result).toEqual(original);
    });

    it('roundtrips text messages of various sizes', () => {
      const messages = ['ok', 'hello', 'a'.repeat(100), 'b'.repeat(500), 'c'.repeat(2000), 'd'.repeat(5000)];
      for (const msg of messages) {
        const original = new TextEncoder().encode(msg);
        const result = unpad(pad(original));
        expect(new TextDecoder().decode(result)).toBe(msg);
      }
    });

    it('produces consistent bucket sizes for same-length messages', () => {
      const msg1 = pad(new TextEncoder().encode('hi'));
      const msg2 = pad(new TextEncoder().encode('no'));
      expect(msg1.length).toBe(msg2.length);
    });

    it('same-bucket messages are same size (traffic analysis resistance)', () => {
      const short = pad(new TextEncoder().encode('ok'));
      const medium = pad(new TextEncoder().encode("yes, let's meet tomorrow"));
      // Both under 124 bytes so fit in 128-byte bucket
      expect(short.length).toBe(128);
      expect(medium.length).toBe(128);
    });
  });

  describe('cross-platform vectors', () => {
    it('matches expected output for "hello"', () => {
      const plaintext = new TextEncoder().encode('hello');
      const padded = pad(plaintext);
      expect(padded.length).toBe(128);
      // Length prefix: 0x00 0x00 0x00 0x05
      expect(padded[0]).toBe(0);
      expect(padded[3]).toBe(5);
      // Plaintext at offset 4
      expect(padded[4]).toBe(0x68); // 'h'
      expect(padded[8]).toBe(0x6F); // 'o'
      // Zero padding
      expect(padded[9]).toBe(0);
    });
  });
});
