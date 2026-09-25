/**
 * SMP relay path optimizer.
 *
 * Calls the Grapheme Memory TSP HTTP endpoint (builders-stack-rs
 * POST /grapheme/optimize) for the actual optimisation. The canonical
 * algorithm lives in Guard8.ai/grapheme-nn/grapheme-routing.
 *
 * Falls back to greedy (lowest-latency first) when the API is unreachable.
 */

import { PUBLIC_SMP_SERVERS } from '../simplex/client';

// ---- Relay node ----

export interface RelayNode {
  id: string;
  host: string;
  port: number;
  latencyMs: number;
  region: string;   // 'eu' | 'us' | 'ap' | 'unknown'
}

export interface RelayPath {
  hops: RelayNode[];
  estimatedLatencyMs: number;
}

// ---- Default relay nodes ----

const DEFAULT_RELAY_LATENCIES: Record<string, number> = {
  'smp4.simplex.im': 45,
  'smp5.simplex.im': 50,
  'smp6.simplex.im': 55,
};

const DEFAULT_RELAY_REGIONS: Record<string, string> = {
  'smp4.simplex.im': 'us',
  'smp5.simplex.im': 'eu',
  'smp6.simplex.im': 'eu',
};

export function publicRelayNodes(measured?: Partial<Record<string, number>>): RelayNode[] {
  return PUBLIC_SMP_SERVERS.map((host, i) => ({
    id: `relay-${i}`,
    host,
    port: 5223,
    latencyMs: measured?.[host] ?? DEFAULT_RELAY_LATENCIES[host] ?? 100,
    region: DEFAULT_RELAY_REGIONS[host] ?? 'unknown',
  }));
}

// ---- Grapheme API endpoint ----

const GRAPHEME_API = process.env['NEXT_PUBLIC_GRAPHEME_API_URL'] ?? 'http://localhost:3001';

interface GraphemeResponse {
  tour: number[];
  cost: number;
  relayHops: string[];
}

async function callGraphemeApi(nodes: RelayNode[]): Promise<RelayPath> {
  const res = await fetch(`${GRAPHEME_API}/grapheme/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      relays: nodes.map(n => ({
        host: n.host,
        latencyMs: n.latencyMs,
        region: n.region === 'unknown' ? null : n.region,
      })),
    }),
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) throw new Error(`grapheme API ${res.status}`);
  const data = await res.json() as GraphemeResponse;

  const hopOrder = data.relayHops.length > 0
    ? data.relayHops
    : data.tour.slice(0, -1).map(i => nodes[i].host);

  const hops = hopOrder
    .map(host => nodes.find(n => n.host === host))
    .filter((n): n is RelayNode => n != null);

  return { hops, estimatedLatencyMs: data.cost };
}

// ---- Greedy fallback ----

function greedyPath(nodes: RelayNode[], startIdx = 0): RelayPath {
  const sorted = [nodes[startIdx], ...nodes.filter((_, i) => i !== startIdx)];
  const cost = sorted.slice(0, -1).reduce(
    (sum, n, i) => sum + (sorted[i + 1].latencyMs + n.latencyMs) / 2,
    0
  );
  return { hops: sorted, estimatedLatencyMs: cost };
}

// ---- Public API ----

export async function optimizeRelayPath(
  nodes: RelayNode[],
  startIdx = 0,
): Promise<RelayPath> {
  if (nodes.length === 0) throw new Error('optimizeRelayPath: no relay nodes');
  if (nodes.length === 1) return { hops: nodes, estimatedLatencyMs: nodes[0].latencyMs };

  const rotated = startIdx === 0
    ? nodes
    : [...nodes.slice(startIdx), ...nodes.slice(0, startIdx)];

  try {
    return await callGraphemeApi(rotated);
  } catch {
    return greedyPath(rotated);
  }
}

export async function selectAndOptimizeRelays(
  measured: Partial<Record<string, number>>
): Promise<RelayPath> {
  const nodes = publicRelayNodes(measured);
  let bestIdx = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].latencyMs < nodes[bestIdx].latencyMs) bestIdx = i;
  }
  return optimizeRelayPath(nodes, bestIdx);
}
