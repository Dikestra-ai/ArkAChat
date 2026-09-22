import { supabase } from './client.js';
import type { Intent } from '../../intent/types.js';

export async function logFallback(args: {
  userId: number;
  query: string;
  intent: Intent | null;
  llmResponse: string;
}): Promise<void> {
  const { error } = await supabase.from('adel_pending_scripts').insert({
    user_id: args.userId,
    source_query: args.query,
    intent: args.intent ?? {},
    llm_response: args.llmResponse,
    status: 'pending',
  });
  if (error) console.error('teacher guard log failed:', error.message);
}
