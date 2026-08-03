/**
 * Message padding to prevent size-based traffic analysis.
 * Pads plaintext to fixed-size buckets before encryption.
 *
 * Uses a simple length-prefixed scheme:
 * - First 4 bytes: plaintext length (big-endian uint32)
 * - Then: plaintext bytes
 * - Then: zero-fill to next bucket boundary
 *
 * Bucket sizes: 128, 256, 512, 1024, 2048, 4096 bytes.
 * Messages larger than 4096 are padded to the next multiple of 256.
 *
 * Must match Android implementation exactly for cross-platform compatibility.
 */

const BUCKET_SIZES = [128, 256, 512, 1024, 2048, 4096] as const;
const LENGTH_PREFIX_SIZE = 4;

function nextBucketSize(totalSize: number): number {
  for (const bucket of BUCKET_SIZES) {
    if (bucket >= totalSize) return bucket;
  }
  return Math.ceil(totalSize / 256) * 256;
}

/**
 * Pad plaintext to the next bucket size.
 * Format: [4-byte big-endian length] [plaintext] [zero padding]
 */
export function pad(plaintext: Uint8Array): Uint8Array {
  const totalNeeded = LENGTH_PREFIX_SIZE + plaintext.length;
  const targetSize = nextBucketSize(totalNeeded);

  const padded = new Uint8Array(targetSize);
  // Write plaintext length as 4-byte big-endian
  padded[0] = (plaintext.length >>> 24) & 0xff;
  padded[1] = (plaintext.length >>> 16) & 0xff;
  padded[2] = (plaintext.length >>> 8) & 0xff;
  padded[3] = plaintext.length & 0xff;
  // Copy plaintext after length prefix
  padded.set(plaintext, LENGTH_PREFIX_SIZE);
  // Remaining bytes are zero (Uint8Array is zero-initialized)
  return padded;
}

/**
 * Remove padding from decrypted plaintext.
 * Reads the 4-byte length prefix, then extracts that many bytes.
 */
export function unpad(padded: Uint8Array): Uint8Array {
  if (padded.length < LENGTH_PREFIX_SIZE) {
    throw new Error('Padded data too short');
  }
  const length =
    ((padded[0] << 24) | (padded[1] << 16) | (padded[2] << 8) | padded[3]) >>> 0;
  if (length > padded.length - LENGTH_PREFIX_SIZE) {
    throw new Error(`Invalid plaintext length: ${length}`);
  }
  return padded.slice(LENGTH_PREFIX_SIZE, LENGTH_PREFIX_SIZE + length);
}
