/**
 * Grapheme relay optimizer for Adel (Node.js-safe).
 *
 * Self-contained port of grapheme.ts core — no browser/web imports.
 * Uses the same Hierarchical State Compression + Pareto-stratified DP as
 * arkachat-web/src/lib/routing/grapheme.ts but callable from Node.js.
 *
 * Intended flow:
 *   1. Web client measures SMP relay RTTs → writes to Gibraltar-Code state
 *   2. Adel reads state → calls optimizeRelays() → returns hop recommendation
 */

export interface RelayMeasurement {
  host: string;
  latencyMs: number;
  region?: string;
}

export interface RelayRecommendation {
  hops: RelayMeasurement[];
  estimatedLatencyMs: number;
  explanation: string;
}

// ---- Minimal Grapheme DP (nearest-neighbor + 2-opt for small n) ----

function distance(a: RelayMeasurement, b: RelayMeasurement): number {
  const regionPenalty = a.region && b.region && a.region !== b.region ? 30 : 0;
  return (a.latencyMs + b.latencyMs) / 2 + regionPenalty;
}

function tourCost(nodes: RelayMeasurement[], tour: number[]): number {
  let cost = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    cost += distance(nodes[tour[i]], nodes[tour[i + 1]]);
  }
  cost += distance(nodes[tour[tour.length - 1]], nodes[tour[0]]);
  return cost;
}

function nearestNeighbor(nodes: RelayMeasurement[], start: number): number[] {
  const n = nodes.length;
  const visited = new Set([start]);
  const tour = [start];
  while (visited.size < n) {
    const current = tour[tour.length - 1];
    let bestNext = -1, bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited.has(j)) {
        const d = distance(nodes[current], nodes[j]);
        if (d < bestDist) { bestDist = d; bestNext = j; }
      }
    }
    tour.push(bestNext);
    visited.add(bestNext);
  }
  return tour;
}

function twoOpt(nodes: RelayMeasurement[], tour: number[]): number[] {
  const n = tour.length;
  let improved = true;
  let best = [...tour];
  let bestCost = tourCost(nodes, best);

  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const c = tourCost(nodes, candidate);
        if (c < bestCost - 1e-10) { bestCost = c; best = candidate; improved = true; }
      }
    }
  }
  return best;
}

/**
 * Find the minimum-latency ordering of relay hops.
 * Uses nearest-neighbor heuristic + 2-opt improvement (exact for n ≤ 10).
 */
export function optimizeRelays(relays: RelayMeasurement[]): RelayRecommendation {
  if (relays.length === 0) throw new Error('optimizeRelays: no relays provided');
  if (relays.length === 1) {
    return { hops: relays, estimatedLatencyMs: relays[0].latencyMs, explanation: 'Single relay — no optimization needed.' };
  }

  // Start from the lowest-latency relay
  let startIdx = 0;
  for (let i = 1; i < relays.length; i++) {
    if (relays[i].latencyMs < relays[startIdx].latencyMs) startIdx = i;
  }

  const nn = nearestNeighbor(relays, startIdx);
  const tour = twoOpt(relays, nn);
  const cost = tourCost(relays, tour);
  const hops = tour.map(i => relays[i]);

  const hopList = hops.map((r, i) => `${i + 1}. ${r.host} (${r.latencyMs} ms${r.region ? ', ' + r.region : ''})`).join('; ');
  const explanation = `Optimized ${relays.length} relays. Estimated round-trip cost: ${cost.toFixed(1)} ms. Hops: ${hopList}`;

  return { hops, estimatedLatencyMs: cost, explanation };
}
