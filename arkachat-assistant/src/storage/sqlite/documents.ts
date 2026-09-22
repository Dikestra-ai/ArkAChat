import { db } from './db.js';
import type { AdelDocument, ChunkMatch } from '../documents.js';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function createDocument(args: {
  businessId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number;
}): Promise<AdelDocument> {
  const info = db.prepare(`
    insert into adel_documents (business_id, filename, mime_type, size_bytes, uploaded_by)
    values (?, ?, ?, ?, ?)
  `).run(args.businessId, args.filename, args.mimeType, args.sizeBytes, args.uploadedBy);
  return db.prepare('select * from adel_documents where id = ?').get(Number(info.lastInsertRowid)) as AdelDocument;
}

export async function insertChunks(args: {
  documentId: number;
  businessId: number;
  chunks: { content: string; embedding: number[] }[];
}): Promise<void> {
  const stmt = db.prepare(`
    insert into adel_document_chunks (document_id, business_id, chunk_index, content, embedding)
    values (?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction(() => {
    args.chunks.forEach((chunk, i) => {
      stmt.run(args.documentId, args.businessId, i, chunk.content, JSON.stringify(chunk.embedding));
    });
  });
  insertMany();
}

export async function searchChunks(args: {
  businessId: number;
  queryEmbedding: number[];
  matchCount?: number;
}): Promise<ChunkMatch[]> {
  const rows = db.prepare(`
    select c.id as chunk_id, c.document_id, d.filename, c.content, c.embedding
    from adel_document_chunks c
    join adel_documents d on d.id = c.document_id
    where c.business_id = ? and c.embedding is not null
  `).all(args.businessId) as Array<ChunkMatch & { embedding: string }>;

  return rows
    .map((row) => {
      const embedding = JSON.parse(row.embedding) as number[];
      const { embedding: _embedding, ...match } = row;
      return {
        ...match,
        similarity: cosineSimilarity(args.queryEmbedding, embedding),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, args.matchCount ?? 5);
}
