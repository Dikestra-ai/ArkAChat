import { config } from '../config.js';

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

const backend = config.ADEL_STORAGE_BACKEND === 'supabase'
  ? await import('./supabase/documents.js')
  : await import('./sqlite/documents.js');

export const createDocument = backend.createDocument;
export const insertChunks = backend.insertChunks;
export const searchChunks = backend.searchChunks;
