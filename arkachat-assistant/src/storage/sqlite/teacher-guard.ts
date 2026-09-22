import { db } from './db.js';
import type { Intent } from '../../intent/types.js';

export async function logFallback(args: {
  userId: number;
  query: string;
  intent: Intent | null;
  llmResponse: string;
}): Promise<void> {
  try {
    db.prepare(`
      insert into adel_pending_scripts (user_id, source_query, intent, llm_response, status)
      values (?, ?, ?, ?, 'pending')
    `).run(args.userId, args.query, JSON.stringify(args.intent ?? {}), args.llmResponse);
  } catch (err) {
    console.error('teacher guard log failed:', err instanceof Error ? err.message : String(err));
  }
}
