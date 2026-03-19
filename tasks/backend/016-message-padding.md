---
id: backend-016
title: "Message Padding to Prevent Size-Based Traffic Analysis"
status: done
priority: high
tags:
- backend
- security
- side-channel
dependencies:
- backend-013
- backend-014
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 4h
complexity: 5
area: backend
---

# Message Padding to Prevent Size-Based Traffic Analysis

## Causation Chain
> Shield wire format: `nonce(16) || enc(counter(8) || plaintext) || mac(16)`
> Total ciphertext size = 40 + plaintext.length
> This means message size is directly observable: "ok" → 42 bytes, paragraph → 540 bytes.
>
> Android: `ShieldCrypto.kt` line 43 — `session.encrypt(message.toByteArray())` — no padding
> Web: `crypto.ts` line 139 — `this.wasmSession.encrypt(plaintext)` — no padding
>
> Padding must happen BEFORE Shield encryption so all ciphertexts in a size bucket
> are indistinguishable.

## Pre-flight Checks
- [ ] Read `chatguard-android/.../ShieldCrypto.kt` line 41-44 — encrypt without padding
- [ ] Read `chatguard-web/src/lib/shield/crypto.ts` lines 136-141 — encrypt without padding
- [ ] Read `chatguard-web/src/lib/bridge/shieldSimplexBridge.ts` — envelope structure
- [ ] Verify Shield decrypt handles padded plaintext (padding must be strippable)
- [ ] Check maximum SMP message size (if any server-side limit)

## Context
Without padding, an on-path observer can categorize messages by size alone:
- Short replies ("ok", "yes") are ~42 bytes
- Typing indicators are ~90 bytes
- Normal messages are 100-500 bytes
- File metadata messages are ~1000+ bytes

This enables traffic analysis even with end-to-end encryption. Padding messages to
fixed-size buckets makes all messages within a bucket indistinguishable.

## Tasks
- [ ] Define padding bucket sizes: 128, 256, 512, 1024, 2048, 4096 bytes
- [ ] **Android**: Create `MessagePadding.kt` utility
  - `fun pad(plaintext: ByteArray): ByteArray` — pad to next bucket size
  - `fun unpad(padded: ByteArray): ByteArray` — remove padding after decrypt
  - Use PKCS7-style padding: last byte = number of padding bytes
- [ ] **Android**: Integrate padding in `ShieldCrypto.encryptMessage()` and `decryptMessage()`
  - `encryptMessage`: pad → encrypt
  - `decryptMessage`: decrypt → unpad
- [ ] **Web**: Create `messagePadding.ts` utility with same `pad()`/`unpad()` functions
- [ ] **Web**: Integrate padding in `WebShieldCrypto.encryptMessage()` and `decryptMessage()`
- [ ] **Cross-platform**: Ensure Android and Web use identical padding scheme
  - Same bucket sizes, same PKCS7 format, same unpadding logic
- [ ] Add padding to group message encryption in both platforms
- [ ] Build + test + verify ciphertext sizes match bucket boundaries

## Acceptance Criteria
- [ ] All encrypted messages are padded to bucket boundaries before Shield encryption
- [ ] Decryption correctly strips padding and recovers original plaintext
- [ ] Android and Web produce identically-sized ciphertexts for same plaintext
- [ ] Existing cross-platform compatibility tests pass
- [ ] No dead code, no stubs, no warnings
- [ ] Performance: padding adds < 1ms overhead

## Notes
- Padding format: `[plaintext] [0x00...] [padding_length as last byte]`
- Example: "ok" (2 bytes) → pad to 128: [0x6F, 0x6B, 0x00 * 125, 0x7E] (126 = 0x7E padding)
- Max bucket 4096 is sufficient for text; file transfers use StreamCipher (separate path)
- Must match across platforms for interoperability

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
