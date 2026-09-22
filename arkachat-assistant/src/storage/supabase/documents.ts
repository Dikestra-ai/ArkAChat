import { supabase } from './client.js';

export interface AdelDocument {
  id: number;
  business_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: number;
  created_at: string;
}

export interface ChunkMatch {
  chunk_id: number;
  document_id: number;
  filename: string;
  content: string;
  similarity: number;
}

export async function createDocument(args: {
  businessId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number;
}): Promise<AdelDocument> {
  const { data, error } = await supabase
    .from('adel_documents')
    .insert({
      business_id: args.businessId,
      filename: args.filename,
      mime_type: args.mimeType,
      size_bytes: args.sizeBytes,
      uploaded_by: args.uploadedBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as AdelDocument;
}

export async function insertChunks(args: {
  documentId: number;
  businessId: number;
  chunks: { content: string; embedding: number[] }[];
}): Promise<void> {
  const rows = args.chunks.map((c, i) => ({
    document_id: args.documentId,
    business_id: args.businessId,
    chunk_index: i,
    content: c.content,
    embedding: c.embedding,
  }));
  const { error } = await supabase.from('adel_document_chunks').insert(rows);
  if (error) throw error;
}

export async function searchChunks(args: {
  businessId: number;
  queryEmbedding: number[];
  matchCount?: number;
}): Promise<ChunkMatch[]> {
  const { data, error } = await supabase.rpc('adel_match_chunks', {
    p_business_id: args.businessId,
    p_query_embedding: args.queryEmbedding,
    p_match_count: args.matchCount ?? 5,
  });
  if (error) throw error;
  return (data ?? []) as ChunkMatch[];
}
