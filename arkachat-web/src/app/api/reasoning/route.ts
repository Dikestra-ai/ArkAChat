/**
 * /api/reasoning — Execution log (reasoning trace) proxy.
 *
 * Returns the assistant's routing decisions for a given user — what query
 * was asked, which route was taken (script / rag_grounded / draft_for_owner /
 * error), which handler ran, and the final response.
 *
 * GET ?userId=N[&limit=20]  → ExecutionLogRow[]
 */
import { type NextRequest, NextResponse } from 'next/server';

const ADEL_HTTP = process.env['ADEL_HTTP_URL'] ?? 'http://127.0.0.1:3333';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const limit = searchParams.get('limit') ?? '20';

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${ADEL_HTTP}/causa/log?userId=${encodeURIComponent(userId)}&limit=${encodeURIComponent(limit)}`,
      { cache: 'no-store' }
    );
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'assistant HTTP API unavailable' }, { status: 503 });
  }
}
