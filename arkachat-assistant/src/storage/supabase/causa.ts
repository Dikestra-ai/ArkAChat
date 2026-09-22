import { supabase } from './client.js';

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

export async function remember(entry: CausaEntry): Promise<void> {
  const { error } = await supabase.from('adel_causa_memory').insert(entry);
  if (error) throw error;
}

export async function recall(args: {
  userId: number;
  subject: string;
  w_type?: WType;
}): Promise<CausaEntry[]> {
  let q = supabase
    .from('adel_causa_memory')
    .select('*')
    .eq('user_id', args.userId)
    .ilike('subject', `%${args.subject}%`)
    .order('created_at', { ascending: false })
    .limit(5);
  if (args.w_type) q = q.eq('w_type', args.w_type);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export type ExecutionRoute =
  | 'script'
  | 'llm_fallback'      // legacy single-channel fallback
  | 'llm_owner'         // owner/employee fallback after no script matched
  | 'rag_grounded'      // client query answered from documents
  | 'draft_for_owner'   // client query → owner approval queue
  | 'error';

export async function logExecution(row: {
  user_id: number;
  channel: string;
  query: string;
  intent: unknown;
  route: ExecutionRoute;
  handler?: string;
  latency_ms: number;
  success: boolean;
  response: string;
}): Promise<void> {
  const { error } = await supabase.from('adel_execution_log').insert(row);
  if (error) console.error('execution log failed:', error.message);
}
