import { config } from '../config.js';

export type WType = 'what' | 'where' | 'when' | 'who' | 'why' | 'how' | 'how_much';

export interface CausaEntry {
  id?: number;
  user_id: number;
  w_type: WType;
  subject: string;
  content: string;
  raw_query?: string;
  created_at?: string;
}

export type ExecutionRoute =
  | 'script'
  | 'llm_fallback'
  | 'llm_owner'
  | 'rag_grounded'
  | 'draft_for_owner'
  | 'error';

const backend = config.ADEL_STORAGE_BACKEND === 'supabase'
  ? await import('./supabase/causa.js')
  : await import('./sqlite/causa.js');

export const remember = backend.remember;
export const recall = backend.recall;
export const logExecution = backend.logExecution;
