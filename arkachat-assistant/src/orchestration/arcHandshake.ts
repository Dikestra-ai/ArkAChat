/**
 * ARC ↔ ArkAChat Gibraltar-Code cross-session handshake.
 *
 * Implements integration-006: establishes a bidirectional coordination channel
 * between the ArkAChat assistant session and the ARC research session
 * (efe432ef-6791-4739-bc48-ff43d25e5232).
 *
 * Protocol:
 *   1. ArkAChat publishes capability manifest to shared state
 *   2. Polls `arc.ready` state key to detect when ARC session registers
 *   3. Exchanges capability handshake via send/receive
 *   4. On ARC request: dispatches graphemeRelayOptimize() and writes result
 *
 * Gibraltar-Code state keys used:
 *   arkachat.ready              — published: { version, capabilities, ts }
 *   arkachat.grapheme.status    — "ready" when TypeScript port is live
 *   arkachat.relay.measurements — relay latencies from web client (written by web)
 *   arc.ready                   — polled: set by ARC session when it registers
 *   arc.grapheme.request        — ARC writes: { distances: number[][] }
 *   arc.grapheme.response       — ArkAChat writes: { tour, cost, stats }
 */

import { execSync } from 'child_process';
import { graphemeRelayOptimize } from './dikestra-tools.js';

const ARKACHAT_CAPABILITIES = [
  'grapheme-tsp',
  'relay-optimization',
  'causa-memory',
  'simplexmq',
  'ecdsa-group-signing',
];

const POLL_INTERVAL_MS = 15_000;
const ARC_SESSION = 'arc';

function gibGet(key: string): unknown {
  try {
    const raw = execSync(`gibraltar-code state get "${key}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function gibSet(key: string, value: unknown): void {
  try {
    const safe = JSON.stringify(value).replace(/'/g, "'\\''");
    execSync(`gibraltar-code state set "${key}" '${safe}'`, { stdio: 'pipe' });
  } catch { /* silently skip */ }
}

function gibSend(target: string, message: string): void {
  try {
    const safe = message.replace(/"/g, '\\"');
    execSync(`gibraltar-code send ${target} "${safe}"`, { stdio: 'pipe' });
  } catch { /* silently skip — target may not be registered */ }
}

/** Publish ArkAChat capabilities to shared state. */
export function publishCapabilities(): void {
  gibSet('arkachat.ready', {
    version: '1.0.0',
    capabilities: ARKACHAT_CAPABILITIES,
    ts: new Date().toISOString(),
  });
  gibSet('arkachat.grapheme.status', 'ready');
  console.log('[arc-handshake] capabilities published to Gibraltar-Code state');
}

/** Handle an ARC session grapheme optimization request. */
function handleGraphemeRequest(request: unknown): void {
  if (typeof request !== 'object' || request === null) return;
  const req = request as Record<string, unknown>;

  if (!Array.isArray(req['relays'])) {
    console.warn('[arc-handshake] grapheme request missing relays array');
    return;
  }

  try {
    const result = graphemeRelayOptimize(JSON.stringify(req['relays']));
    gibSet('arc.grapheme.response', {
      ok: result.ok,
      data: result.data,
      requestId: req['requestId'] ?? null,
      ts: new Date().toISOString(),
    });
    console.log('[arc-handshake] grapheme response written for ARC session');
  } catch (err) {
    gibSet('arc.grapheme.response', { ok: false, error: String(err), ts: new Date().toISOString() });
  }
}

let arcSeenReady = false;
let lastGraphemeRequest: string | null = null;

/** Poll for ARC session state and process requests. */
function pollArcState(): void {
  // Check if ARC session has come online
  const arcReady = gibGet('arc.ready');
  if (arcReady && !arcSeenReady) {
    arcSeenReady = true;
    console.log('[arc-handshake] ARC session detected as ready:', arcReady);
    gibSend(ARC_SESSION, JSON.stringify({
      type: 'handshake',
      from: 'arkachat',
      capabilities: ARKACHAT_CAPABILITIES,
      graphemeStatus: 'ready',
    }));
  }

  // Check for grapheme optimization requests from ARC
  const graphemeReq = gibGet('arc.grapheme.request');
  const reqStr = JSON.stringify(graphemeReq);
  if (graphemeReq && reqStr !== lastGraphemeRequest) {
    lastGraphemeRequest = reqStr;
    handleGraphemeRequest(graphemeReq);
  }

  // Check for relay measurements written by the web client
  const measurements = gibGet('arkachat.relay.measurements');
  if (measurements) {
    // Proactively compute optimal relay order and publish it
    try {
      const result = graphemeRelayOptimize(JSON.stringify(measurements));
      if (result.ok) {
        gibSet('arkachat.relay.optimal', { recommendation: result.data, ts: new Date().toISOString() });
      }
    } catch { /* ignore */ }
  }
}

/** Start the cross-session handshake poller. */
export function startArcHandshake(): void {
  publishCapabilities();
  // Initial poll after a short delay (let Gibraltar-Code settle)
  setTimeout(() => {
    pollArcState();
    setInterval(pollArcState, POLL_INTERVAL_MS);
  }, 3_000);
  console.log('[arc-handshake] ARC↔ArkAChat bridge started (polling every', POLL_INTERVAL_MS / 1000, 's)');
}
