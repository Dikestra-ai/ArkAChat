/**
 * Lightweight HTTP API server for CausaDB + Reasoning trace queries.
 *
 * Exposes the assistant's SQLite data to the web layer without requiring
 * direct DB file access from the Next.js process.
 *
 * Routes:
 *   GET /causa/recall?userId=N&subject=X[&wType=Y]   → CausaEntry[]
 *   GET /causa/log?userId=N[&limit=20]               → execution log rows
 *   GET /users/by-telegram?telegramId=N              → AdelUser | null
 *   GET /health                                       → { ok: true }
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { recall, logExecution } from './causa.js';
import { config } from '../config.js';
import { db } from './sqlite/db.js';
import type { AdelUser } from './users.js';

function parseQuery(url: string): Record<string, string> {
  const q: Record<string, string> = {};
  try {
    const u = new URL(url, 'http://localhost');
    u.searchParams.forEach((v, k) => { q[k] = v; });
  } catch { /* ignore */ }
  return q;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const path = url.split('?')[0];
  const q = parseQuery(url);

  if (path === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (path === '/causa/recall') {
    const userId = parseInt(q['userId'] ?? '', 10);
    const subject = q['subject'] ?? '';
    if (!userId || !subject) { json(res, 400, { error: 'userId and subject are required' }); return; }
    const entries = await recall({ userId, subject, w_type: q['wType'] as Parameters<typeof recall>[0]['w_type'] });
    json(res, 200, entries);
    return;
  }

  if (path === '/causa/log') {
    const userId = parseInt(q['userId'] ?? '', 10);
    if (!userId) { json(res, 400, { error: 'userId is required' }); return; }
    const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
    const rows = db.prepare(
      `select id, user_id, channel, query, intent, route, handler, latency_ms, success, response, created_at
       from adel_execution_log
       where user_id = ?
       order by created_at desc
       limit ?`
    ).all(userId, limit);
    json(res, 200, rows);
    return;
  }

  if (path === '/users/by-telegram') {
    const telegramId = parseInt(q['telegramId'] ?? '', 10);
    if (!telegramId) { json(res, 400, { error: 'telegramId is required' }); return; }
    const user = db.prepare('select * from adel_users where telegram_id = ?').get(telegramId) as AdelUser | undefined;
    json(res, user ? 200 : 404, user ?? null);
    return;
  }

  if (path === '/users/by-id') {
    const id = parseInt(q['id'] ?? '', 10);
    if (!id) { json(res, 400, { error: 'id is required' }); return; }
    const user = db.prepare('select * from adel_users where id = ?').get(id) as AdelUser | undefined;
    json(res, user ? 200 : 404, user ?? null);
    return;
  }

  json(res, 404, { error: 'not found' });
}

export function startHttpServer(): void {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('[http-server] error:', err);
      json(res, 500, { error: 'internal server error' });
    });
  });

  server.listen(config.ADEL_HTTP_PORT, '127.0.0.1', () => {
    console.log(`[http-server] CausaDB API listening on 127.0.0.1:${config.ADEL_HTTP_PORT}`);
  });
}
