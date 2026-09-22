import { db } from './db.js';
import type { CausaEntry, ExecutionRoute } from '../causa.js';

export async function remember(entry: CausaEntry): Promise<void> {
  db.prepare(`
    insert into adel_causa_memory (user_id, w_type, subject, content, raw_query)
    values (?, ?, ?, ?, ?)
  `).run(entry.user_id, entry.w_type, entry.subject, entry.content, entry.raw_query ?? null);
}

export async function recall(args: {
  userId: number;
  subject: string;
  w_type?: CausaEntry['w_type'];
}): Promise<CausaEntry[]> {
  const pattern = `%${args.subject}%`;
  const rows = args.w_type
    ? db.prepare(`
        select * from adel_causa_memory
        where user_id = ? and subject like ? and w_type = ?
        order by created_at desc
        limit 5
      `).all(args.userId, pattern, args.w_type)
    : db.prepare(`
        select * from adel_causa_memory
        where user_id = ? and subject like ?
        order by created_at desc
        limit 5
      `).all(args.userId, pattern);
  return rows as CausaEntry[];
}

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
  try {
    db.prepare(`
      insert into adel_execution_log
        (user_id, channel, query, intent, route, handler, latency_ms, success, response)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.user_id,
      row.channel,
      row.query,
      JSON.stringify(row.intent ?? null),
      row.route,
      row.handler ?? null,
      row.latency_ms,
      row.success ? 1 : 0,
      row.response,
    );
  } catch (err) {
    console.error('execution log failed:', err instanceof Error ? err.message : String(err));
  }
}
