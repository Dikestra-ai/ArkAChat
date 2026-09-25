/**
 * SMP relay path optimizer — wraps GraphemeMemoryTSP for relay node routing.
 *
 * Bridges ArkAChat SMP client with the Grapheme Memory TSP algorithm (ported
 * from ARC/np-optima). Given a set of SMP relay nodes, returns the
 * minimum-latency traversal order for multi-hop message routing.
 *
 * Integration point: insert between relay discovery and WebSocket connect in
 * arkachat-web/src/lib/simplex/client.ts
 *
 * Session: ARC efe432ef-6791-4739-bc48-ff43d25e5232 ↔ arkachat Gibraltar bridge
 */

import { GraphemeMemoryTSP, type GraphemeResult, type TspInstance } from './grapheme';
import { PUBLIC_SMP_SERVERS } from '../simplex/client';

// ---- Relay node ----

export interface RelayNode {
  id: string;
  host: string;
  port: number;
  latencyMs: number;     // measured or estimated round-trip
  region: string;        // 'eu' | 'us' | 'ap' | 'unknown'
}

// ---- Relay path result ----

export interface RelayPath {
  hops: RelayNode[];
  estimatedLatencyMs: number;
  graphemeResult: GraphemeResult;
}

// ---- Default relay nodes from the SMP client ----

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

/**
 * Build RelayNode entries from the public SMP server list.
 * Latency values default to known estimates; pass `measured` to override.
 */
export function publicRelayNodes(measured?: Partial<Record<string, number>>): RelayNode[] {
  return PUBLIC_SMP_SERVERS.map((host, i) => ({
    id: `relay-${i}`,
    host,
    port: 5223,
    latencyMs: measured?.[host] ?? DEFAULT_RELAY_LATENCIES[host] ?? 100,
    region: DEFAULT_RELAY_REGIONS[host] ?? 'unknown',
  }));
}

// ---- Distance matrix ----

/**
 * Build a symmetric latency-based distance matrix.
 * Distance between relays a and b = average of their individual RTTs
 * (approximates bi-directional relay hop cost).
 */
function buildDistanceMatrix(nodes: RelayNode[]): number[][] {
  const n = nodes.length;
  return nodes.map((a, i) =>
    nodes.map((b, j) => {
      if (i === j) return 0;
      // Cross-region penalty: add 30 ms for region hops
      const regionPenalty = a.region !== b.region ? 30 : 0;
      return (a.latencyMs + b.latencyMs) / 2 + regionPenalty;
    })
  );
}

/**
 * Approximate 2D coordinates from relay regions for the Grapheme compressor.
 * Region centroids: us=(0,0), eu=(100,0), ap=(200,0), unknown=(100,100).
 */
function buildRelayPoints(nodes: RelayNode[]): [number, number][] {
  const regionCentroids: Record<string, [number, number]> = {
    us: [0, 0], eu: [100, 0], ap: [200, 0], unknown: [100, 100],
  };
  return nodes.map(n => regionCentroids[n.region] ?? regionCentroids.unknown);
}

// ---- Main optimizer ----

/**
 * Find the minimum-latency path through a set of relay nodes.
 *
 * Uses Grapheme Memory TSP to explore the Pareto-optimal frontier of relay
 * traversals, returning the cheapest complete tour and the sequential hop list.
 *
 * For n ≤ exactThreshold the solver is exact; above that it uses hierarchical
 * compression to stay polynomial.
 *
 * @param nodes        Candidate relay nodes (including source at index 0)
 * @param startIdx     Index of the source relay (default 0)
 * @param kNeighbors   k-NN count for local pattern compression (default 4)
 * @param nClusters    Number of geographic clusters (default 4)
 * @param exactThreshold Remaining-nodes count at which exact DP switches on (default 4)
 */
export function optimizeRelayPath(
  nodes: RelayNode[],
  startIdx = 0,
  kNeighbors = 4,
  nClusters = 4,
  exactThreshold = 4
): RelayPath {
  if (nodes.length === 0) throw new Error('optimizeRelayPath: no relay nodes provided');
  if (nodes.length === 1) {
    return { hops: nodes, estimatedLatencyMs: 0, graphemeResult: { tour: [0, 0], cost: 0, stats: { totalStates: 1, frontierStates: 1, layerCount: 1, compressionCollisions: 0, exactPhaseStates: 0, approxPhaseStates: 0 } } };
  }

  // Rotate nodes so the start relay is at index 0
  const rotated = startIdx === 0
    ? nodes
    : [...nodes.slice(startIdx), ...nodes.slice(0, startIdx)];

  const distances = buildDistanceMatrix(rotated);
  const points = buildRelayPoints(rotated);

  const instance: TspInstance = { n: rotated.length, distances, points };
  const solver = new GraphemeMemoryTSP(instance, kNeighbors, nClusters, exactThreshold);
  const result = solver.solve();

  // Map tour indices back to relay nodes (exclude last which closes the tour)
  const hops = result.tour.slice(0, -1).map(idx => rotated[idx]);

  return { hops, estimatedLatencyMs: result.cost, graphemeResult: result };
}

/**
 * Given a measured latency map (host → ms), pick the lowest-latency relay
 * as the entry point and optimize the remaining hop order.
 *
 * Useful when the client has already probed each relay and wants the
 * full multi-hop ordering rather than just "pick the fastest one".
 */
export function selectAndOptimizeRelays(
  measured: Partial<Record<string, number>>
): RelayPath {
  const nodes = publicRelayNodes(measured);
  // Entry = the relay with minimum measured latency
  let bestIdx = 0, bestMs = Infinity;
  nodes.forEach((n, i) => { if (n.latencyMs < bestMs) { bestMs = n.latencyMs; bestIdx = i; } });
  return optimizeRelayPath(nodes, bestIdx);
}
