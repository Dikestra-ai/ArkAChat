/**
 * /api/causa — CausaDB memory proxy.
 *
 * Forwards requests to the assistant's HTTP API (ADEL_HTTP_URL, default
 * http://127.0.0.1:3333) which reads/writes the SQLite CausaDB tables.
 *
 * GET  ?userId=N&subject=X[&wType=Y]         → CausaEntry[]
 * POST { userId, wType, subject, content, rawQuery? } → 204 (triggers Gibraltar-Code emit)
 */
import { type NextRequest, NextResponse } from 'next/server';

const ADEL_HTTP = process.env['ADEL_HTTP_URL'] ?? 'http://127.0.0.1:3333';

async function proxyGet(path: string): Promise<NextResponse> {
  try {
    const res = await fetch(`${ADEL_HTTP}${path}`, { cache: 'no-store' });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'assistant HTTP API unavailable' }, { status: 503 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const subject = searchParams.get('subject');
  const wType = searchParams.get('wType');

  if (!userId || !subject) {
    return NextResponse.json({ error: 'userId and subject are required' }, { status: 400 });
  }

  const params = new URLSearchParams({ userId, subject });
  if (wType) params.set('wType', wType);
  return proxyGet(`/causa/recall?${params}`);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { userId, wType, subject, content, rawQuery } = body;
  if (!userId || !wType || !subject || !content) {
    return NextResponse.json({ error: 'userId, wType, subject, content are required' }, { status: 400 });
  }

  // Forward to assistant via Gibraltar-Code (fire-and-forget; assistant owns the write path)
  try {
    const { execSync } = await import('child_process');
    const payload = JSON.stringify({ userId, wType, subject, content, rawQuery: rawQuery ?? null });
    const safe = payload.replace(/'/g, "'\\''");
    execSync(`gibraltar-code state set "causa.web_remember" '${safe}'`, { stdio: 'pipe' });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'could not dispatch remember request' }, { status: 503 });
  }
}
