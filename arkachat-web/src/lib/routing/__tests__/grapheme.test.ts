/**
 * Tests for Grapheme Memory TSP (TS port) and RelayOptimizer
 *
 * Verifies correctness of the ported algorithm against known small instances:
 * - 4-city symmetric instance with known optimal tour
 * - Tour closure (first == last)
 * - Finite cost
 * - Relay optimizer integration
 */

import { describe, it, expect } from 'vitest';
import { GraphemeMemoryTSP, type TspInstance } from '../grapheme';
import { optimizeRelayPath, selectAndOptimizeRelays, type RelayNode } from '../relayOptimizer';

// ---- Small known instances ----

function squareInstance(): TspInstance {
  // 4 cities at corners of a 10×10 unit square
  // 0=(0,0), 1=(10,0), 2=(10,10), 3=(0,10)
  // Optimal tour visits consecutive corners: cost = 4 × 10 = 40
  const d = (a: [number, number], b: [number, number]) =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  const pts: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const distances = pts.map(a => pts.map(b => d(a, b)));
  return { n: 4, distances, points: pts };
}

function asymmetricInstance(): TspInstance {
  // 5-city star pattern: city 0 is center, 1-4 are spokes at cardinal directions
  // Spoke distances = 10; spoke-to-spoke shortcuts are longer (14.14)
  const spoke = 10;
  const pts: [number, number][] = [[0, 0], [0, 10], [10, 0], [0, -10], [-10, 0]];
  const d = (a: [number, number], b: [number, number]) =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  const distances = pts.map(a => pts.map(b => d(a, b)));
  return { n: 5, distances, points: pts };
}

// ---- GraphemeMemoryTSP tests ----

describe('GraphemeMemoryTSP', () => {
  it('returns a closed tour (first == last)', () => {
    const inst = squareInstance();
    const result = new GraphemeMemoryTSP(inst).solve();
    expect(result.tour[0]).toBe(result.tour[result.tour.length - 1]);
  });

  it('tour visits all cities exactly once', () => {
    const inst = squareInstance();
    const result = new GraphemeMemoryTSP(inst).solve();
    const body = result.tour.slice(0, -1); // exclude closing node
    const unique = new Set(body);
    expect(unique.size).toBe(inst.n);
    for (let i = 0; i < inst.n; i++) expect(unique.has(i)).toBe(true);
  });

  it('tour has length n+1 (n cities + closing return)', () => {
    const inst = squareInstance();
    const result = new GraphemeMemoryTSP(inst).solve();
    expect(result.tour.length).toBe(inst.n + 1);
  });

  it('cost is finite and positive', () => {
    const inst = squareInstance();
    const result = new GraphemeMemoryTSP(inst).solve();
    expect(result.cost).toBeLessThan(Infinity);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('optimal tour cost ≤ 41 for 4-city square (optimal=40)', () => {
    // Grapheme is exact for n=4 with exactThreshold=6
    const inst = squareInstance();
    const result = new GraphemeMemoryTSP(inst, 3, 2, 6).solve();
    expect(result.cost).toBeLessThanOrEqual(41);
  });

  it('5-city star: cost is finite and all cities visited', () => {
    const inst = asymmetricInstance();
    const result = new GraphemeMemoryTSP(inst).solve();
    expect(result.cost).toBeLessThan(Infinity);
    const body = new Set(result.tour.slice(0, -1));
    expect(body.size).toBe(5);
  });

  it('stats: totalStates > 0 after solve', () => {
    const inst = squareInstance();
    const result = new GraphemeMemoryTSP(inst).solve();
    expect(result.stats.totalStates).toBeGreaterThan(0);
  });

  it('works with distance-only instance (no points provided)', () => {
    const inst = squareInstance();
    const noPoints: TspInstance = { n: inst.n, distances: inst.distances };
    const result = new GraphemeMemoryTSP(noPoints).solve();
    expect(result.tour.length).toBe(inst.n + 1);
    expect(result.cost).toBeLessThan(Infinity);
  });

  it('single-city degenerate: n=1', () => {
    const inst: TspInstance = { n: 1, distances: [[0]], points: [[0, 0]] };
    // Should not throw; any tour is valid for n=1
    const result = new GraphemeMemoryTSP(inst).solve();
    expect(result.tour.length).toBeGreaterThanOrEqual(1);
  });
});

// ---- RelayOptimizer tests ----

describe('optimizeRelayPath', () => {
  const threeRelays: RelayNode[] = [
    { id: 'r0', host: 'smp4.simplex.im', port: 5223, latencyMs: 45, region: 'us' },
    { id: 'r1', host: 'smp5.simplex.im', port: 5223, latencyMs: 30, region: 'eu' },
    { id: 'r2', host: 'smp6.simplex.im', port: 5223, latencyMs: 55, region: 'eu' },
  ];

  it('returns all relay nodes in hops', () => {
    const path = optimizeRelayPath(threeRelays);
    expect(path.hops.length).toBe(3);
  });

  it('estimated latency is finite and positive', () => {
    const path = optimizeRelayPath(threeRelays);
    expect(path.estimatedLatencyMs).toBeLessThan(Infinity);
    expect(path.estimatedLatencyMs).toBeGreaterThan(0);
  });

  it('hops contain exactly the input relay ids (all visited)', () => {
    const path = optimizeRelayPath(threeRelays);
    const ids = new Set(path.hops.map(h => h.id));
    expect(ids.size).toBe(3);
    for (const r of threeRelays) expect(ids.has(r.id)).toBe(true);
  });

  it('throws on empty relay list', () => {
    expect(() => optimizeRelayPath([])).toThrow();
  });

  it('single relay returns immediately with cost 0', () => {
    const path = optimizeRelayPath([threeRelays[0]]);
    expect(path.estimatedLatencyMs).toBe(0);
    expect(path.hops.length).toBe(1);
  });

  it('startIdx rotates the entry relay to front', () => {
    const path = optimizeRelayPath(threeRelays, 1);
    expect(path.hops[0].id).toBe('r1');
  });
});

describe('selectAndOptimizeRelays', () => {
  it('selects lowest-latency relay as first hop', () => {
    const measured: Record<string, number> = {
      'smp4.simplex.im': 80,
      'smp5.simplex.im': 20,  // lowest
      'smp6.simplex.im': 60,
    };
    const path = selectAndOptimizeRelays(measured);
    expect(path.hops[0].host).toBe('smp5.simplex.im');
  });

  it('returns a valid path over all public relays', () => {
    const path = selectAndOptimizeRelays({});
    expect(path.hops.length).toBe(3); // PUBLIC_SMP_SERVERS has 3 entries
  });
});
