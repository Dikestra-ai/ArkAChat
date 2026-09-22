/**
 * /api/assistant — bridge between the ArkAChat web UI and the assistant service.
 *
 * GET  ?action=status   — read assistant readiness from Gibraltar-Code shared state
 * GET  ?action=drafts   — read latest pending draft (owner notification)
 * POST                  — dispatch a query to the assistant via Gibraltar-Code
 */
import { type NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

function gibState(key: string): unknown {
  try {
    const raw = execSync(`gibraltar-code state get "${key}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function setGibState(key: string, value: unknown): void {
  const safe = JSON.stringify(value).replace(/'/g, "'\\''");
  execSync(`gibraltar-code state set "${key}" '${safe}'`, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export async function GET(req: NextRequest) {
  const action = new URL(req.url).searchParams.get('action') ?? 'status';

  if (action === 'status') {
    const state = gibState('assistant.ready');
    return NextResponse.json({ ready: state !== null, state });
  }

  if (action === 'drafts') {
    const pending = gibState('assistant.draft_pending');
    return NextResponse.json({ pending });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { query?: string; userId?: string };
  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  try {
    setGibState('assistant.web_query', {
      query: body.query,
      userId: body.userId ?? 'web-anonymous',
      ts: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, message: 'query dispatched to assistant' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
