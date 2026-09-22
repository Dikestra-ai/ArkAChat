/**
 * Tests for GroupAdminKeyManager and the canonical signing-input format.
 *
 * Runs under Vitest (WebCrypto is available in Node 20+ natively).
 * IndexedDB-dependent methods (generateAdminKey, isAdmin, getPublicKey) are
 * tested via the instrumented E2E suite; here we test the crypto primitives
 * and the canonical input format which must match Android exactly.
 */

import { describe, it, expect } from 'vitest';
import { GroupAdminKeyManager, ADMIN_CONTROLLED_TYPES, buildSigningInput } from '../groupAdminKeyManager';

const SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const;
const KEY_GEN_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const;

async function generateTestKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(KEY_GEN_PARAMS, true, ['sign', 'verify']);
}

async function signRaw(privateKey: CryptoKey, message: Uint8Array): Promise<Uint8Array> {
  const buf = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer;
  const sig = await crypto.subtle.sign(SIGN_PARAMS, privateKey, buf);
  return new Uint8Array(sig);
}

// Create an instance that skips IndexedDB (methods that need IDB are not tested here)
class TestGroupAdminKeyManager extends GroupAdminKeyManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override async storeKeyPair(_groupId: string, _kp: CryptoKeyPair) { /* no-op */ }
  protected override async loadFromIdb(_groupId: string): Promise<CryptoKeyPair | null> { return null; }
  protected override async deleteFromIdb(_groupId: string): Promise<void> { /* no-op */ }
}

// ---- buildSigningInput ----

describe('buildSigningInput', () => {
  it('produces the expected canonical format', async () => {
    const input = await buildSigningInput('MEMBER_ADDED', 'g1', 's1', 1700000000000, '');
    const text = new TextDecoder().decode(input);
    expect(text).toMatch(/^arkachat:control:v1:/);
    expect(text).toContain('MEMBER_ADDED:g1:s1:1700000000000:');
    // SHA-256('') well-known value
    expect(text).toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is deterministic', async () => {
    const a = await buildSigningInput('MEMBER_REMOVED', 'g1', 's1', 999, '{}');
    const b = await buildSigningInput('MEMBER_REMOVED', 'g1', 's1', 999, '{}');
    expect(a).toEqual(b);
  });

  it('differs for different types', async () => {
    const a = await buildSigningInput('MEMBER_ADDED', 'g1', 's1', 1, '');
    const b = await buildSigningInput('MEMBER_REMOVED', 'g1', 's1', 1, '');
    expect(a).not.toEqual(b);
  });

  it('differs for different payloads', async () => {
    const a = await buildSigningInput('KEY_ROTATION', 'g1', 's1', 1, '{"k":1}');
    const b = await buildSigningInput('KEY_ROTATION', 'g1', 's1', 1, '{"k":2}');
    expect(a).not.toEqual(b);
  });

  it('differs for different timestamps', async () => {
    const a = await buildSigningInput('KEY_ROTATION', 'g1', 's1', 1000, '');
    const b = await buildSigningInput('KEY_ROTATION', 'g1', 's1', 2000, '');
    expect(a).not.toEqual(b);
  });
});

// ---- ADMIN_CONTROLLED_TYPES ----

describe('ADMIN_CONTROLLED_TYPES', () => {
  it('covers all required control types', () => {
    expect(ADMIN_CONTROLLED_TYPES.has('MEMBER_ADDED')).toBe(true);
    expect(ADMIN_CONTROLLED_TYPES.has('MEMBER_REMOVED')).toBe(true);
    expect(ADMIN_CONTROLLED_TYPES.has('KEY_ROTATION')).toBe(true);
    expect(ADMIN_CONTROLLED_TYPES.has('GROUP_INFO_UPDATE')).toBe(true);
    expect(ADMIN_CONTROLLED_TYPES.has('ADMIN_CHANGE')).toBe(true);
    expect(ADMIN_CONTROLLED_TYPES.has('TEXT')).toBe(false);
    expect(ADMIN_CONTROLLED_TYPES.has('FILE')).toBe(false);
  });
});

// ---- verifyControlMessage (using JVM-local keypair — no Keystore / IndexedDB) ----

describe('verifyControlMessage', () => {
  it('accepts a valid signature', async () => {
    const mgr = new TestGroupAdminKeyManager();
    const kp = await generateTestKeyPair();
    const message = await buildSigningInput('MEMBER_ADDED', 'g1', 's1', 100, '');
    const rawSig = await signRaw(kp.privateKey, message);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));

    const ok = await mgr.verifyControlMessage(spki, 'MEMBER_ADDED', 'g1', 's1', 100, '', rawSig);
    expect(ok).toBe(true);
  });

  it('rejects tampered signature', async () => {
    const mgr = new TestGroupAdminKeyManager();
    const kp = await generateTestKeyPair();
    const message = await buildSigningInput('MEMBER_ADDED', 'g1', 's1', 100, '');
    const rawSig = await signRaw(kp.privateKey, message);
    rawSig[0] ^= 0xFF; // flip bits
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));

    const ok = await mgr.verifyControlMessage(spki, 'MEMBER_ADDED', 'g1', 's1', 100, '', rawSig);
    expect(ok).toBe(false);
  });

  it('rejects wrong type', async () => {
    const mgr = new TestGroupAdminKeyManager();
    const kp = await generateTestKeyPair();
    const message = await buildSigningInput('MEMBER_ADDED', 'g1', 's1', 100, '');
    const rawSig = await signRaw(kp.privateKey, message);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));

    const ok = await mgr.verifyControlMessage(spki, 'MEMBER_REMOVED', 'g1', 's1', 100, '', rawSig);
    expect(ok).toBe(false);
  });

  it('rejects wrong public key', async () => {
    const mgr = new TestGroupAdminKeyManager();
    const kp1 = await generateTestKeyPair();
    const kp2 = await generateTestKeyPair();
    const message = await buildSigningInput('ADMIN_CHANGE', 'g1', 's1', 300, '{}');
    const rawSig = await signRaw(kp1.privateKey, message);
    const wrongSpki = new Uint8Array(await crypto.subtle.exportKey('spki', kp2.publicKey));

    const ok = await mgr.verifyControlMessage(wrongSpki, 'ADMIN_CHANGE', 'g1', 's1', 300, '{}', rawSig);
    expect(ok).toBe(false);
  });

  it('rejects wrong-length signature', async () => {
    const mgr = new TestGroupAdminKeyManager();
    const kp = await generateTestKeyPair();
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
    const bad = new Uint8Array(65); // wrong size

    const ok = await mgr.verifyControlMessage(spki, 'MEMBER_ADDED', 'g1', 's1', 1, '', bad);
    expect(ok).toBe(false);
  });
});

// ---- Cross-platform test vector ----
// The signing-input string must exactly match GroupAdminKeyManagerTest.kt on Android.

describe('cross-platform test vector', () => {
  const TYPE = 'MEMBER_ADDED';
  const GROUP = 'vec-group';
  const SENDER = 'vec-sender';
  const TS = 1700000000000;

  it('signing input matches Android expected string', async () => {
    const input = await buildSigningInput(TYPE, GROUP, SENDER, TS, '');
    const text = new TextDecoder().decode(input);
    const expected =
      'arkachat:control:v1:MEMBER_ADDED:vec-group:vec-sender:1700000000000:' +
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(text).toBe(expected);
  });

  it('signature round-trip: Web sign → Web verify', async () => {
    const mgr = new TestGroupAdminKeyManager();
    const kp = await generateTestKeyPair();
    const message = await buildSigningInput(TYPE, GROUP, SENDER, TS, '');
    const rawSig = await signRaw(kp.privateKey, message);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));

    const ok = await mgr.verifyControlMessage(spki, TYPE, GROUP, SENDER, TS, '', rawSig);
    expect(ok).toBe(true);
  });
});
