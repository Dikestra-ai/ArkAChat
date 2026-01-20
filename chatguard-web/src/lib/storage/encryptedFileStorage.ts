/**
 * Encrypted File Storage using Shield.
 *
 * All files are stored encrypted at rest using Shield's StreamCipher-equivalent.
 * Files can be downloaded either encrypted (for backup/transfer) or decrypted (for viewing).
 *
 * File format:
 * - Magic header: "SHLD_ENC" (8 bytes)
 * - Version: 0x01 (1 byte)
 * - Metadata length: 4 bytes (little-endian)
 * - Encrypted metadata: JSON with filename, type, size, checksum
 * - Encrypted content: AES-GCM encrypted data
 */

import { Shield } from '../shield/crypto';

const MAGIC_HEADER = new TextEncoder().encode('SHLD_ENC');
const VERSION = 0x01;
const HEADER_SIZE = 8 + 1 + 4; // magic + version + metadata_length
const CHUNK_SIZE = 65536; // 64KB chunks for streaming

/**
 * File metadata stored with encrypted file.
 */
export interface FileMetadata {
  originalName: string;
  mimeType: string;
  originalSize: number;
  createdAt: number;
  checksum?: string; // SHA256 of plaintext
}

/**
 * Reference to an encrypted file.
 */
export interface EncryptedFileRef {
  id: string;
  contactId: string;
  encryptedSize: number;
  metadata?: FileMetadata;
}

/**
 * Encrypted file storage using Shield and IndexedDB.
 */
export class EncryptedFileStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private keyStore: KeyStore) {}

  /**
   * Save a file encrypted with Shield.
   */
  async saveEncrypted(
    contactId: string,
    file: File,
    metadata?: Partial<FileMetadata>
  ): Promise<EncryptedFileRef> {
    const fileId = crypto.randomUUID();

    // Read file content
    const plaintext = new Uint8Array(await file.arrayBuffer());

    // Calculate checksum
    const checksum = await this.calculateChecksum(plaintext);

    // Build metadata
    const fullMetadata: FileMetadata = {
      originalName: metadata?.originalName ?? file.name,
      mimeType: (metadata?.mimeType ?? file.type) || 'application/octet-stream',
      originalSize: plaintext.length,
      createdAt: metadata?.createdAt ?? Date.now(),
      checksum,
    };

    // Get file key
    const fileKey = await this.deriveFileKey(contactId, fileId);

    // Encrypt metadata
    const metadataJson = JSON.stringify(fullMetadata);
    const metadataBytes = new TextEncoder().encode(metadataJson);
    const encryptedMetadata = await Shield.quickEncrypt(fileKey, metadataBytes);

    // Encrypt content
    const encryptedContent = await Shield.quickEncrypt(fileKey, plaintext);

    // Build encrypted file
    const encryptedFile = this.buildEncryptedFile(encryptedMetadata, encryptedContent);

    // Store in IndexedDB
    const db = await this.openDatabase();
    await this.storeFile(db, fileId, contactId, encryptedFile);

    return {
      id: fileId,
      contactId,
      encryptedSize: encryptedFile.length,
      metadata: fullMetadata,
    };
  }

  /**
   * Save from Uint8Array (for received files).
   */
  async saveEncryptedFromBytes(
    contactId: string,
    data: Uint8Array,
    metadata: FileMetadata
  ): Promise<EncryptedFileRef> {
    const fileId = crypto.randomUUID();

    // Calculate checksum
    const checksum = await this.calculateChecksum(data);
    const fullMetadata = { ...metadata, checksum };

    // Get file key
    const fileKey = await this.deriveFileKey(contactId, fileId);

    // Encrypt metadata
    const metadataJson = JSON.stringify(fullMetadata);
    const metadataBytes = new TextEncoder().encode(metadataJson);
    const encryptedMetadata = await Shield.quickEncrypt(fileKey, metadataBytes);

    // Encrypt content
    const encryptedContent = await Shield.quickEncrypt(fileKey, data);

    // Build encrypted file
    const encryptedFile = this.buildEncryptedFile(encryptedMetadata, encryptedContent);

    // Store in IndexedDB
    const db = await this.openDatabase();
    await this.storeFile(db, fileId, contactId, encryptedFile);

    return {
      id: fileId,
      contactId,
      encryptedSize: encryptedFile.length,
      metadata: fullMetadata,
    };
  }

  /**
   * Load and decrypt a file.
   */
  async loadDecrypted(fileRef: EncryptedFileRef): Promise<Blob> {
    const db = await this.openDatabase();
    const encryptedFile = await this.retrieveFile(db, fileRef.id);

    if (!encryptedFile) {
      throw new Error(`File not found: ${fileRef.id}`);
    }

    // Parse header and decrypt
    const { metadata, content } = await this.parseAndDecrypt(
      encryptedFile,
      fileRef.contactId,
      fileRef.id
    );

    // Verify checksum
    if (metadata.checksum) {
      const actualChecksum = await this.calculateChecksum(content);
      if (actualChecksum !== metadata.checksum) {
        throw new Error('Checksum mismatch: file may be corrupted');
      }
    }

    return new Blob([content], { type: metadata.mimeType });
  }

  /**
   * Download file in encrypted form (for backup/transfer).
   * The file remains encrypted and can be transferred to another device.
   */
  async downloadEncrypted(fileRef: EncryptedFileRef): Promise<Blob> {
    const db = await this.openDatabase();
    const encryptedFile = await this.retrieveFile(db, fileRef.id);

    if (!encryptedFile) {
      throw new Error(`File not found: ${fileRef.id}`);
    }

    return new Blob([encryptedFile], { type: 'application/octet-stream' });
  }

  /**
   * Download file in decrypted form (for viewing/sharing).
   */
  async downloadDecrypted(fileRef: EncryptedFileRef): Promise<Blob> {
    return this.loadDecrypted(fileRef);
  }

  /**
   * Get a download URL for encrypted file.
   * Creates a temporary object URL.
   */
  async getEncryptedDownloadUrl(fileRef: EncryptedFileRef): Promise<string> {
    const blob = await this.downloadEncrypted(fileRef);
    return URL.createObjectURL(blob);
  }

  /**
   * Get a download URL for decrypted file.
   * Creates a temporary object URL.
   */
  async getDecryptedDownloadUrl(fileRef: EncryptedFileRef): Promise<string> {
    const blob = await this.downloadDecrypted(fileRef);
    return URL.createObjectURL(blob);
  }

  /**
   * Trigger browser download of encrypted file.
   */
  async triggerEncryptedDownload(fileRef: EncryptedFileRef, filename?: string): Promise<void> {
    const url = await this.getEncryptedDownloadUrl(fileRef);
    const metadata = await this.getMetadata(fileRef);
    const downloadName = filename ?? `${metadata?.originalName ?? fileRef.id}.enc`;

    this.triggerDownload(url, downloadName);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /**
   * Trigger browser download of decrypted file.
   */
  async triggerDecryptedDownload(fileRef: EncryptedFileRef, filename?: string): Promise<void> {
    const url = await this.getDecryptedDownloadUrl(fileRef);
    const metadata = await this.getMetadata(fileRef);
    const downloadName = filename ?? metadata?.originalName ?? fileRef.id;

    this.triggerDownload(url, downloadName);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /**
   * Get metadata for an encrypted file without decrypting content.
   */
  async getMetadata(fileRef: EncryptedFileRef): Promise<FileMetadata | null> {
    const db = await this.openDatabase();
    const encryptedFile = await this.retrieveFile(db, fileRef.id);

    if (!encryptedFile) {
      return null;
    }

    try {
      const { metadata } = await this.parseAndDecrypt(
        encryptedFile,
        fileRef.contactId,
        fileRef.id,
        true // metadata only
      );
      return metadata;
    } catch {
      return null;
    }
  }

  /**
   * Import an encrypted file received from another device.
   */
  async importEncrypted(
    contactId: string,
    encryptedData: Uint8Array,
    fileId?: string
  ): Promise<EncryptedFileRef> {
    const id = fileId ?? crypto.randomUUID();

    // Validate header
    if (encryptedData.length < HEADER_SIZE) {
      throw new Error('Invalid encrypted file: too small');
    }

    const magic = encryptedData.slice(0, 8);
    if (!this.arraysEqual(magic, MAGIC_HEADER)) {
      throw new Error('Invalid encrypted file: bad magic header');
    }

    // Store in IndexedDB
    const db = await this.openDatabase();
    await this.storeFile(db, id, contactId, encryptedData);

    return {
      id,
      contactId,
      encryptedSize: encryptedData.length,
    };
  }

  /**
   * Delete an encrypted file.
   */
  async delete(fileRef: EncryptedFileRef): Promise<void> {
    const db = await this.openDatabase();
    await this.deleteFile(db, fileRef.id);
  }

  /**
   * List all encrypted files for a contact.
   */
  async listFiles(contactId: string): Promise<EncryptedFileRef[]> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const index = store.index('contactId');
      const request = index.getAll(contactId);

      request.onsuccess = () => {
        const files = request.result.map((record: StoredFile) => ({
          id: record.id,
          contactId: record.contactId,
          encryptedSize: record.data.length,
        }));
        resolve(files);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get total storage used by encrypted files.
   */
  async getStorageUsed(): Promise<number> {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const request = store.getAll();

      request.onsuccess = () => {
        const total = request.result.reduce(
          (sum: number, record: StoredFile) => sum + record.data.length,
          0
        );
        resolve(total);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Private helpers

  private async deriveFileKey(contactId: string, fileId: string): Promise<Uint8Array> {
    const mediaKey = await this.keyStore.getKey(`media_key_${contactId}`);
    if (!mediaKey) {
      throw new Error(`No media key for contact: ${contactId}`);
    }

    // HKDF-like derivation: HMAC(mediaKey, fileId)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      mediaKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const fileIdBytes = new TextEncoder().encode(fileId);
    const derived = await crypto.subtle.sign('HMAC', cryptoKey, fileIdBytes);
    return new Uint8Array(derived);
  }

  private buildEncryptedFile(
    encryptedMetadata: Uint8Array,
    encryptedContent: Uint8Array
  ): Uint8Array {
    const metadataLength = this.intToLittleEndian(encryptedMetadata.length);

    const totalSize =
      MAGIC_HEADER.length + 1 + 4 + encryptedMetadata.length + encryptedContent.length;
    const result = new Uint8Array(totalSize);

    let offset = 0;

    // Magic header
    result.set(MAGIC_HEADER, offset);
    offset += MAGIC_HEADER.length;

    // Version
    result[offset] = VERSION;
    offset += 1;

    // Metadata length
    result.set(metadataLength, offset);
    offset += 4;

    // Encrypted metadata
    result.set(encryptedMetadata, offset);
    offset += encryptedMetadata.length;

    // Encrypted content
    result.set(encryptedContent, offset);

    return result;
  }

  private async parseAndDecrypt(
    encryptedFile: Uint8Array,
    contactId: string,
    fileId: string,
    metadataOnly = false
  ): Promise<{ metadata: FileMetadata; content: Uint8Array }> {
    // Validate magic header
    const magic = encryptedFile.slice(0, 8);
    if (!this.arraysEqual(magic, MAGIC_HEADER)) {
      throw new Error('Invalid file: bad magic header');
    }

    // Read version
    const version = encryptedFile[8];
    if (version !== VERSION) {
      throw new Error(`Unsupported file version: ${version}`);
    }

    // Read metadata length
    const metadataLength = this.littleEndianToInt(encryptedFile.slice(9, 13));

    // Read encrypted metadata
    const encryptedMetadata = encryptedFile.slice(13, 13 + metadataLength);

    // Get file key
    const fileKey = await this.deriveFileKey(contactId, fileId);

    // Decrypt metadata
    const metadataBytes = await Shield.quickDecrypt(fileKey, encryptedMetadata);
    const metadataJson = new TextDecoder().decode(metadataBytes);
    const metadata: FileMetadata = JSON.parse(metadataJson);

    if (metadataOnly) {
      return { metadata, content: new Uint8Array(0) };
    }

    // Decrypt content
    const encryptedContent = encryptedFile.slice(13 + metadataLength);
    const content = await Shield.quickDecrypt(fileKey, encryptedContent);

    return { metadata, content };
  }

  private async calculateChecksum(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private intToLittleEndian(value: number): Uint8Array {
    return new Uint8Array([
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      (value >> 24) & 0xff,
    ]);
  }

  private littleEndianToInt(bytes: Uint8Array): number {
    return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  }

  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private triggerDownload(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // IndexedDB operations

  private async openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('chatguard-files', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'id' });
          store.createIndex('contactId', 'contactId', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  private async storeFile(
    db: IDBDatabase,
    fileId: string,
    contactId: string,
    data: Uint8Array
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');

      const record: StoredFile = {
        id: fileId,
        contactId,
        data: Array.from(data), // Convert to array for IndexedDB
        createdAt: Date.now(),
      };

      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async retrieveFile(db: IDBDatabase, fileId: string): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const request = store.get(fileId);

      request.onsuccess = () => {
        const record = request.result as StoredFile | undefined;
        if (record) {
          resolve(new Uint8Array(record.data));
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFile(db: IDBDatabase, fileId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const request = store.delete(fileId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

interface StoredFile {
  id: string;
  contactId: string;
  data: number[];
  createdAt: number;
}

/**
 * Key store interface for accessing encryption keys.
 */
export interface KeyStore {
  getKey(keyId: string): Promise<Uint8Array | null>;
}

/**
 * Create EncryptedFileStorage with the Shield crypto key store.
 */
export function createEncryptedFileStorage(keyStore: KeyStore): EncryptedFileStorage {
  return new EncryptedFileStorage(keyStore);
}
