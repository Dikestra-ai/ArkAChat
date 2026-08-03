/* tslint:disable */
/* eslint-disable */

export class WasmLamportSignature {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get key fingerprint.
   */
  fingerprint(): string;
  /**
   * Verify a Lamport signature (static method).
   */
  static verifySignature(message: Uint8Array, signature: Uint8Array, public_key: Uint8Array): boolean;
  /**
   * Generate a new Lamport key pair.
   */
  constructor();
  /**
   * Sign a message (ONE TIME ONLY - key becomes invalid after use).
   */
  sign(message: Uint8Array): Uint8Array;
  /**
   * Get public key.
   */
  readonly publicKey: Uint8Array;
  /**
   * Check if key has been used.
   */
  readonly isUsed: boolean;
}

export class WasmRatchetSession {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new ratchet session from shared root key.
   */
  constructor(root_key: Uint8Array, is_initiator: boolean);
  /**
   * Decrypt a message with forward secrecy.
   */
  decrypt(encrypted: Uint8Array): Uint8Array;
  /**
   * Encrypt a message with forward secrecy.
   */
  encrypt(plaintext: Uint8Array): Uint8Array;
  /**
   * Get receive counter.
   */
  readonly recvCounter: bigint;
  /**
   * Get send counter.
   */
  readonly sendCounter: bigint;
}

export class WasmShield {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the derived key (for interop testing).
   */
  key(): Uint8Array;
  /**
   * Create a new Shield instance from password and service.
   */
  constructor(password: string, service: string);
  /**
   * Decrypt data.
   */
  decrypt(encrypted: Uint8Array): Uint8Array;
  /**
   * Encrypt data.
   */
  encrypt(plaintext: Uint8Array): Uint8Array;
  /**
   * Create Shield instance from raw key (32 bytes).
   */
  static withKey(key: Uint8Array): WasmShield;
}

export class WasmTOTP {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Verify TOTP code for current time.
   */
  verifyNow(code: string, window: number): boolean;
  /**
   * Decode Base32 secret.
   */
  static fromBase32(encoded: string): Uint8Array;
  /**
   * Generate TOTP code for current time.
   */
  generateNow(): string;
  /**
   * Create TOTP with custom settings.
   */
  static withSettings(secret: Uint8Array, digits: number, interval: bigint): WasmTOTP;
  /**
   * Generate a random secret (20 bytes).
   */
  static generateSecret(): Uint8Array;
  /**
   * Get provisioning URI for authenticator apps.
   */
  provisioningUri(account: string, issuer: string): string;
  /**
   * Create TOTP with secret (default: 6 digits, 30 second interval).
   */
  constructor(secret: Uint8Array);
  /**
   * Verify TOTP code with time window.
   */
  verify(code: string, timestamp: bigint, window: number): boolean;
  /**
   * Generate TOTP code for given timestamp (seconds since epoch).
   */
  generate(timestamp: bigint): string;
  /**
   * Encode secret to Base32.
   */
  toBase32(): string;
}

/**
 * Constant-time comparison.
 */
export function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean;

/**
 * HMAC-SHA256.
 */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array;

/**
 * Quick decrypt with pre-shared key (WASM export).
 */
export function quickDecrypt(key: Uint8Array, encrypted: Uint8Array): Uint8Array;

/**
 * Quick encrypt with pre-shared key (WASM export).
 */
export function quickEncrypt(key: Uint8Array, data: Uint8Array): Uint8Array;

/**
 * Generate random bytes.
 */
export function randomBytes(size: number): Uint8Array;

/**
 * SHA-256 hash.
 */
export function sha256(data: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmlamportsignature_free: (a: number, b: number) => void;
  readonly __wbg_wasmratchetsession_free: (a: number, b: number) => void;
  readonly __wbg_wasmshield_free: (a: number, b: number) => void;
  readonly __wbg_wasmtotp_free: (a: number, b: number) => void;
  readonly constantTimeEquals: (a: number, b: number, c: number, d: number) => number;
  readonly hmacSha256: (a: number, b: number, c: number, d: number) => [number, number];
  readonly quickDecrypt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly quickEncrypt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly randomBytes: (a: number) => [number, number, number, number];
  readonly sha256: (a: number, b: number) => [number, number];
  readonly wasmlamportsignature_fingerprint: (a: number) => [number, number];
  readonly wasmlamportsignature_isUsed: (a: number) => number;
  readonly wasmlamportsignature_new: () => [number, number, number];
  readonly wasmlamportsignature_publicKey: (a: number) => [number, number];
  readonly wasmlamportsignature_sign: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmlamportsignature_verifySignature: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly wasmratchetsession_decrypt: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmratchetsession_encrypt: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmratchetsession_new: (a: number, b: number, c: number) => [number, number, number];
  readonly wasmratchetsession_recvCounter: (a: number) => bigint;
  readonly wasmratchetsession_sendCounter: (a: number) => bigint;
  readonly wasmshield_decrypt: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmshield_encrypt: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmshield_key: (a: number) => [number, number];
  readonly wasmshield_new: (a: number, b: number, c: number, d: number) => number;
  readonly wasmshield_withKey: (a: number, b: number) => [number, number, number];
  readonly wasmtotp_fromBase32: (a: number, b: number) => [number, number, number, number];
  readonly wasmtotp_generate: (a: number, b: bigint) => [number, number];
  readonly wasmtotp_generateNow: (a: number) => [number, number];
  readonly wasmtotp_generateSecret: () => [number, number, number, number];
  readonly wasmtotp_new: (a: number, b: number) => number;
  readonly wasmtotp_provisioningUri: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly wasmtotp_toBase32: (a: number) => [number, number];
  readonly wasmtotp_verify: (a: number, b: number, c: number, d: bigint, e: number) => number;
  readonly wasmtotp_verifyNow: (a: number, b: number, c: number, d: number) => number;
  readonly wasmtotp_withSettings: (a: number, b: number, c: number, d: bigint) => number;
  readonly ring_core_0_17_14__bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
