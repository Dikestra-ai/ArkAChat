# Group Control Message Signing Specification v1

## Purpose

Prevent unauthorized group membership changes, key rotations, and admin changes by
requiring that every group control message be signed by the current group admin.
Members verify the signature before applying any control message locally.

---

## Cryptographic Algorithm

| Property | Value |
|----------|-------|
| Algorithm | ECDSA P-256 |
| Hash | SHA-256 |
| Android JCE name | `SHA256withECDSA` |
| WebCrypto name | `{ name: 'ECDSA', hash: 'SHA-256' }` |

---

## Key Format

**Public key wire format**: X.509 SubjectPublicKeyInfo (SPKI), DER-encoded.

- Android: `keyStore.getCertificate(alias).publicKey.encoded`
  (returns SPKI automatically for Keystore EC keys)
- Web: `crypto.subtle.exportKey('spki', publicKey)`
  / `importKey('spki', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])`

These produce/consume the same binary format — no conversion needed.

**Private key storage**:
- Android: Android Keystore, alias `arkachat_admin_key_{groupId}`, hardware-backed where available.
  Key never leaves the secure element in plaintext.
- Web: `crypto.subtle.generateKey(…, false /* non-extractable */, ['sign', 'verify'])`.
  Stored as a non-extractable CryptoKey in IndexedDB.

---

## Signature Wire Format

**64 bytes, raw (r || s)**, big-endian, zero-padded to 32 bytes each.

- Android JCE's `Signature.sign()` returns DER-encoded ECDSA.
  `GroupAdminKeyManager.derToRaw()` converts to wire format before sending.
  `GroupAdminKeyManager.rawToDer()` converts back before passing to JCE for verification.
- WebCrypto's `crypto.subtle.sign('ECDSA', …)` returns raw (r || s) natively.
  No conversion needed on the web side.

---

## Canonical Signing Input

```
signingInput = "arkachat:control:v1:{type}:{groupId}:{senderId}:{timestamp}:{sha256hex(payloadJson)}"
```

| Field | Description |
|-------|-------------|
| `type` | `GroupMessageType` name, e.g. `MEMBER_ADDED` |
| `groupId` | Group UUID string |
| `senderId` | Sender contact ID (empty string for self) |
| `timestamp` | Unix milliseconds as decimal integer |
| `sha256hex(payloadJson)` | Lowercase hex SHA-256 of the JSON payload string (UTF-8 encoded) |

**Empty payload**: `sha256hex("") = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`

**Example**:
```
arkachat:control:v1:MEMBER_ADDED:vec-group:vec-sender:1700000000000:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

The signing input is UTF-8 encoded before being passed to the signature operation.

---

## Message Types

### Control messages that MUST be signed

| Type | Description |
|------|-------------|
| `MEMBER_ADDED` | A new member was added to the group |
| `MEMBER_REMOVED` | A member was removed (triggers key rotation) |
| `KEY_ROTATION` | Group encryption key was rotated |
| `GROUP_INFO_UPDATE` | Group name, avatar, or other metadata changed |
| `ADMIN_CHANGE` | Admin role transferred to a different member |

### Messages that do NOT require signing

`TEXT`, `FILE`, `DELIVERY_RECEIPT`, `READ_RECEIPT` — these are content messages
encrypted with the group key (which only members possess), so authenticity is
enforced by the encryption layer.

---

## Envelope Fields

`GroupMessageEnvelope` carries two optional fields for control messages:

```typescript
adminSignature?: string;  // Base64 of 64-byte raw (r || s) signature
adminPublicKey?: string;  // Base64 of X.509 SPKI — present only when redistributing the key
```

`adminPublicKey` is present in:
- The initial group invite (first `KEY_ROTATION` or `MEMBER_ADDED` carrying the admin key)
- Subsequent `KEY_ROTATION` messages (may carry the same or updated admin key)
- `ADMIN_CHANGE` messages (carries the new admin's public key, signed by the old admin)

---

## Verification Protocol

When a member receives a control message:

1. Check `envelope.type` is in the controlled-types set. If not, skip verification.
2. Extract `adminSignature` from the envelope. If absent, reject the message.
3. Decode `adminSignature` from base64 → 64 bytes.
4. Determine the admin public key:
   - If the local `Group.adminPublicKey` is set, use it.
   - Else if this is the first message for the group and `envelope.adminPublicKey` is present,
     use it **and immediately store it** in `Group.adminPublicKey` before applying the message.
   - Otherwise reject (no trusted key available).
5. Call `verifyControlMessage(adminPublicKeyBytes, type, groupId, senderId, timestamp, payloadJson, rawSig)`.
6. If verification fails, discard the message and log a security warning.
7. If verification succeeds, apply the control action locally.

---

## Admin Key Lifecycle

| Event | Action |
|-------|--------|
| Group creation | Admin generates keypair; public key distributed in creation message |
| Key rotation | Admin signs `KEY_ROTATION`; may include `adminPublicKey` |
| Admin change | Old admin signs `ADMIN_CHANGE` with `adminPublicKey` = new admin's key |
| Admin demotion | Old admin deletes local private key (`deleteAdminKey`) |
| New admin | Generates own keypair; new public key distributed via old-admin-signed `ADMIN_CHANGE` |

---

## Cross-Platform Test Vector

The canonical signing-input string for the reference test vector is:

```
arkachat:control:v1:MEMBER_ADDED:vec-group:vec-sender:1700000000000:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Both `GroupAdminKeyManagerTest.kt` (Android) and `groupAdminKeyManager.test.ts` (Web)
assert this exact string from `buildSigningInput("MEMBER_ADDED", "vec-group", "vec-sender", 1700000000000, "")`.

For end-to-end cross-platform verification:
1. Run the web test — it logs `[vector] spki:` and `[vector] sig:` (hex).
2. Use those values in an instrumented Android test to call `verifyControlMessage` with
   the same parameters and confirm it returns `true`.

---

## Implementation Files

| Platform | File |
|----------|------|
| Android | `arkachat-android/…/crypto/GroupAdminKeyManager.kt` |
| Web | `arkachat-web/src/lib/crypto/groupAdminKeyManager.ts` |
| Android model | `arkachat-android/…/model/Group.kt` (adminPublicKey field) |
| Web model | `arkachat-web/src/lib/storage/groupStore.ts` (adminPublicKey, adminSignature fields) |
| Android integration | `GroupKeyManager.kt` → `signEnvelope()`, `verifyEnvelope()` |
| Web integration | `groupKeyManager.ts` → `signEnvelope()`, `verifyEnvelope()` |
| Android tests | `GroupAdminKeyManagerTest.kt` |
| Web tests | `groupAdminKeyManager.test.ts` |
