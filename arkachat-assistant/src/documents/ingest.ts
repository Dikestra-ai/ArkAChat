import { embed } from '../llm/openrouter.js';
import { createDocument, insertChunks } from '../storage/documents.js';

/**
 * Naive chunker: split on double newlines (paragraphs), then merge into
 * windows of ~1000 chars with ~200 char overlap. Good enough for an MVP
 * dealing with price lists, service menus, FAQs.
 */
export function chunkText(text: string, opts?: {
  targetSize?: number;
  overlap?: number;
}): string[] {
  const targetSize = opts?.targetSize ?? 1000;
  const overlap = opts?.overlap ?? 200;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = '';

  for (const p of paragraphs) {
    if (current.length === 0) {
      current = p;
    } else if (current.length + 1 + p.length <= targetSize) {
      current += '\n\n' + p;
    } else {
      chunks.push(current);
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = tail + '\n\n' + p;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Ingest a plain-text document for a business: chunk, embed, store.
 * For PDF support, the caller must extract text first (e.g. with pdf-parse).
 */
export async function ingestDocument(args: {
  businessId: number;
  uploadedBy: number;
  filename: string;
  mimeType: string;
  text: string;
}): Promise<{ documentId: number; chunkCount: number }> {
  const chunks = chunkText(args.text);
  if (chunks.length === 0) {
    throw new Error('document has no extractable text');
  }

  const doc = await createDocument({
    businessId: args.businessId,
    filename: args.filename,
    mimeType: args.mimeType,
    sizeBytes: Buffer.byteLength(args.text, 'utf8'),
    uploadedBy: args.uploadedBy,
  });

  // Embed sequentially to stay under any rate limits in the demo. For
  // production, batch into parallel groups of N=10.
  const embedded: { content: string; embedding: number[] }[] = [];
  for (const c of chunks) {
    const embedding = await embed(c);
    embedded.push({ content: c, embedding });
  }

  await insertChunks({
    documentId: doc.id,
    businessId: args.businessId,
    chunks: embedded,
  });

  return { documentId: doc.id, chunkCount: chunks.length };
}
