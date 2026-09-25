/**
 * Tests for the relay optimizer (relayOptimizer.ts).
 *
 * The Grapheme Memory TSP algorithm now lives in
 * Guard8.ai/grapheme-nn/grapheme-routing (Rust crate) and is exposed via
 * the builders-stack-rs HTTP endpoint POST /grapheme/optimize.
 *
 * These tests verify the TypeScript adapter layer:
 * - greedy fallback when API is unavailable (expected in test env)
 * - relay node construction, rotation, ordering
 */

import { describe, it, expect } from 'vitest';
import { optimizeRelayPath, selectAndOptimizeRelays, publicRelayNodes, type RelayNode } from '../relayOptimizer';

// ---- Fixtures ----

const THREE_RELAYS: RelayNode[] = [
  { id: 'r0', host: 'smp4.simplex.im', port: 5223, latencyMs: 45, region: 'us' },
  { id: 'r1', host: 'smp5.simplex.im', port: 5223, latencyMs: 30, region: 'eu' },
  { id: 'r2', host: 'smp6.simplex.im', port: 5223, latencyMs: 55, region: 'eu' },
];

// ---- optimizeRelayPath ----

describe('optimizeRelayPath', () => {
  it('returns all relay nodes in hops', async () => {
    const path = await optimizeRelayPath(THREE_RELAYS);
    expect(path.hops.length).toBe(3);
  });

  it('estimated latency is finite and positive', async () => {
    const path = await optimizeRelayPath(THREE_RELAYS);
    expect(path.estimatedLatencyMs).toBeLessThan(Infinity);
    expect(path.estimatedLatencyMs).toBeGreaterThan(0);
  });

  it('hops contain exactly the input relay ids (all visited)', async () => {
    const path = await optimizeRelayPath(THREE_RELAYS);
    const ids = new Set(path.hops.map(h => h.id));
    expect(ids.size).toBe(3);
    for (const r of THREE_RELAYS) expect(ids.has(r.id)).toBe(true);
  });

  it('throws on empty relay list', async () => {
    await expect(optimizeRelayPath([])).rejects.toThrow();
  });

  it('single relay returns immediately with latency equal to node latency', async () => {
    const path = await optimizeRelayPath([THREE_RELAYS[0]]);
    expect(path.estimatedLatencyMs).toBe(THREE_RELAYS[0].latencyMs);
    expect(path.hops.length).toBe(1);
  });

  it('startIdx rotates the entry relay to front', async () => {
    // Greedy fallback: r1 (index 1) should be first
    const path = await optimizeRelayPath(THREE_RELAYS, 1);
    expect(path.hops[0].id).toBe('r1');
  });
});

// ---- selectAndOptimizeRelays ----

describe('selectAndOptimizeRelays', () => {
  it('selects lowest-latency relay as first hop', async () => {
    const measured: Record<string, number> = {
      'smp4.simplex.im': 80,
      'smp5.simplex.im': 20,  // lowest
      'smp6.simplex.im': 60,
    };
    const path = await selectAndOptimizeRelays(measured);
    expect(path.hops[0].host).toBe('smp5.simplex.im');
  });

  it('returns a valid path over all public relays', async () => {
    const path = await selectAndOptimizeRelays({});
    expect(path.hops.length).toBe(3); // PUBLIC_SMP_SERVERS has 3 entries
  });
});

// ---- publicRelayNodes ----

describe('publicRelayNodes', () => {
  it('returns 3 nodes without measurements', () => {
    const nodes = publicRelayNodes();
    expect(nodes.length).toBe(3);
  });

  it('overrides latency with measured values', () => {
    const nodes = publicRelayNodes({ 'smp4.simplex.im': 99 });
    const smp4 = nodes.find(n => n.host === 'smp4.simplex.im');
    expect(smp4?.latencyMs).toBe(99);
  });

  it('uses default latency for unmeasured relays', () => {
    const nodes = publicRelayNodes({});
    for (const n of nodes) {
      expect(n.latencyMs).toBeLessThan(Infinity);
      expect(n.latencyMs).toBeGreaterThan(0);
    }
  });
});
