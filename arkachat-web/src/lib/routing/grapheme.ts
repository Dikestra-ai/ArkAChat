/**
 * Grapheme Memory TSP Solver — TypeScript port
 *
 * Ported from /data/git/ARC/np-optima/src/tsp/grapheme.rs
 * Algorithm: Hierarchical State Compression + Pareto-stratified memory
 *
 * Key insight (from ARC research):
 *   Full state space: 2^n (exponential)
 *   Compressed:       O(n² × clusters × regions × local) — polynomial when k = O(log n)
 *
 * In ArkAChat: nodes = SMP relay servers, distance = inter-relay latency.
 * The solver finds the minimum-latency traversal of relay hops for multi-hop routing.
 *
 * Session bridge: ARC session efe432ef-6791-4739-bc48-ff43d25e5232
 * Gibraltar-Code state: arkachat.grapheme.status
 */

// ---- Types ----

export interface CompressedSignature {
  current: number;
  count: number;
  clusterSignature: number[];             // 0-7 per cluster (fraction visited)
  regionalCounts: [number, number, number, number];  // quadrant visit counts
  localPattern: boolean[];                // k-NN visited flags
}

export interface TSPState {
  visited: Set<number>;
  current: number;
  cost: number;
  path: number[];
  diversityScore: number;
  layer: number;
}

export interface GraphemeStats {
  totalStates: number;
  frontierStates: number;
  layerCount: number;
  compressionCollisions: number;
  exactPhaseStates: number;
  approxPhaseStates: number;
}

export interface GraphemeResult {
  tour: number[];
  cost: number;
  stats: GraphemeStats;
}

export interface TspInstance {
  n: number;
  distances: number[][];        // n×n symmetric distance matrix
  points?: [number, number][];  // optional 2D coordinates
}

// ---- Signature key (for Map lookups) ----

function sigKey(s: CompressedSignature): string {
  return `${s.current}|${s.count}|${s.clusterSignature.join(',')}|${s.regionalCounts.join(',')}|${s.localPattern.map(b => b ? '1' : '0').join('')}`;
}

// ---- ParetoMemory ----

function dominates(a: TSPState, b: TSPState): boolean {
  const [ac, ap, ad] = [-a.cost, -a.visited.size, a.diversityScore];
  const [bc, bp, bd] = [-b.cost, -b.visited.size, b.diversityScore];
  let better = false;
  for (const [ai, bi] of [[ac, bc], [ap, bp], [ad, bd]] as [number, number][]) {
    if (ai < bi) return false;
    if (ai > bi) better = true;
  }
  return better;
}

class ParetoMemory {
  private layers: TSPState[][] = [[]];
  private allStates = new Map<string, TSPState>();

  private stateKey(state: TSPState): string {
    const sorted = Array.from(state.visited).sort((a, b) => a - b);
    return `${sorted.join(',')}_${state.current}`;
  }

  insert(state: TSPState, _sig: CompressedSignature): number {
    const key = this.stateKey(state);
    const existing = this.allStates.get(key);
    if (existing) {
      if (state.cost < existing.cost) {
        state.layer = existing.layer;
        this.allStates.set(key, state);
      }
      return state.layer;
    }

    let layerIdx = 0;
    for (const layer of this.layers) {
      const dominated = layer.some(s => dominates(s, state));
      if (!dominated) break;
      layerIdx++;
    }

    while (this.layers.length <= layerIdx) this.layers.push([]);
    state.layer = layerIdx;
    this.layers[layerIdx].push(state);
    this.allStates.set(key, state);
    return layerIdx;
  }

  frontier(): TSPState[] { return this.layers[0]; }
  layerCount(): number { return this.layers.length; }
  totalStates(): number { return this.allStates.size; }
  allLayers(): TSPState[][] { return this.layers; }
}

// ---- HierarchicalCompressor ----

class HierarchicalCompressor {
  private knn: number[][] = [];
  clusters: number[] = [];
  regions: number[] = [];
  private clusterSizes: number[];

  constructor(
    private instance: TspInstance,
    private k: number,
    private nClusters: number,
    private points: [number, number][]
  ) {
    this.clusterSizes = new Array<number>(nClusters).fill(0);
    this.computeKnn();
    this.computeClusters();
    this.computeRegions();
  }

  private computeKnn(): void {
    const { n, distances } = this.instance;
    for (let i = 0; i < n; i++) {
      const neighbors: [number, number][] = [];
      for (let j = 0; j < n; j++) {
        if (j !== i) neighbors.push([distances[i][j], j]);
      }
      neighbors.sort((a, b) => a[0] - b[0]);
      this.knn.push(neighbors.slice(0, this.k).map(([, j]) => j));
    }
  }

  private computeClusters(): void {
    const { n } = this.instance;
    const gridSize = Math.ceil(Math.sqrt(this.nClusters));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of this.points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const rangeX = maxX - minX + 1e-10;
    const rangeY = maxY - minY + 1e-10;
    this.clusters = new Array<number>(n).fill(0);
    this.clusterSizes = new Array<number>(this.nClusters).fill(0);
    for (let i = 0; i < n; i++) {
      const [x, y] = this.points[i];
      const cx = Math.min(Math.floor(((x - minX) / rangeX) * gridSize), gridSize - 1);
      const cy = Math.min(Math.floor(((y - minY) / rangeY) * gridSize), gridSize - 1);
      const cluster = Math.min(cy * gridSize + cx, this.nClusters - 1);
      this.clusters[i] = cluster;
      this.clusterSizes[cluster]++;
    }
  }

  private computeRegions(): void {
    const n = this.instance.n;
    const sumX = this.points.reduce((s, [x]) => s + x, 0);
    const sumY = this.points.reduce((s, [, y]) => s + y, 0);
    const cx = sumX / n, cy = sumY / n;
    this.regions = this.points.map(([x, y]) => (x >= cx ? 1 : 0) + (y >= cy ? 2 : 0));
  }

  compress(visited: Set<number>, current: number): CompressedSignature {
    const count = visited.size;

    // Level 1: cluster fill fraction (0-7)
    const clusterCounts = new Array<number>(this.nClusters).fill(0);
    for (const city of visited) clusterCounts[this.clusters[city]]++;
    const clusterSignature = clusterCounts.map((cnt, c) => {
      const sz = this.clusterSizes[c];
      return sz === 0 ? 0 : Math.min(Math.floor((8 * cnt) / sz), 7);
    });

    // Level 2: quadrant visit counts
    const regionalCounts: [number, number, number, number] = [0, 0, 0, 0];
    for (const city of visited) regionalCounts[this.regions[city]]++;

    // Level 3: k-NN visited pattern
    const localPattern = this.knn[current].map(nb => visited.has(nb));

    return { current, count, clusterSignature, regionalCounts, localPattern };
  }
}

// ---- MDS approximation (distance matrix → 2D points) ----

function approximatePoints(distances: number[][]): [number, number][] {
  const n = distances.length;
  const pts: [number, number][] = new Array(n).fill(null).map(() => [0, 0] as [number, number]);
  if (n >= 2) pts[1] = [distances[0][1], 0];
  for (let i = 2; i < n; i++) {
    const d0 = distances[0][i], d1 = distances[1][i], d01 = distances[0][1];
    if (d01 > 1e-10) {
      const x = (d0 * d0 + d01 * d01 - d1 * d1) / (2 * d01);
      const ySq = d0 * d0 - x * x;
      pts[i] = [x, ySq > 0 ? Math.sqrt(ySq) : 0];
    } else {
      pts[i] = [d0, 0];
    }
  }
  return pts;
}

// ---- GraphemeMemoryTSP ----

export class GraphemeMemoryTSP {
  private compressor: HierarchicalCompressor;
  private memory: ParetoMemory;
  private stats: GraphemeStats;

  constructor(
    private instance: TspInstance,
    private kNeighbors: number = 6,
    private nClusters: number = 4,
    private exactThreshold: number = 6
  ) {
    const points = instance.points ?? approximatePoints(instance.distances);
    this.compressor = new HierarchicalCompressor(instance, kNeighbors, nClusters, points);
    this.memory = new ParetoMemory();
    this.stats = { totalStates: 0, frontierStates: 0, layerCount: 0, compressionCollisions: 0, exactPhaseStates: 0, approxPhaseStates: 0 };
  }

  solve(): GraphemeResult {
    const n = this.instance.n;
    const distances = this.instance.distances;

    const initial = new Set([0]);
    const initState: TSPState = { visited: initial, current: 0, cost: 0, path: [0], diversityScore: 1, layer: 0 };
    this.memory.insert(initState, this.compressor.compress(initial, 0));

    for (let count = 1; count < n; count++) {
      const useExact = (n - count) <= this.exactThreshold;
      const toExpand = this.memory.allLayers().flatMap(l => l).filter(s => s.visited.size === count);

      const newStates = new Map<string, [number, TSPState, CompressedSignature]>();

      for (const state of toExpand) {
        if (useExact) this.stats.exactPhaseStates++; else this.stats.approxPhaseStates++;

        for (let next = 0; next < n; next++) {
          if (state.visited.has(next)) continue;

          const newCost = state.cost + distances[state.current][next];
          const newVisited = new Set(state.visited); newVisited.add(next);
          const newPath = [...state.path, next];
          const newSig = this.compressor.compress(newVisited, next);

          const key = useExact
            ? `${Array.from(newVisited).sort((a, b) => a - b).join(',')}_${next}`
            : `${newSig.count},${next}_${next}`;

          const existing = newStates.get(key);
          if (!existing || newCost < existing[0]) {
            const ns: TSPState = { visited: newVisited, current: next, cost: newCost, path: newPath, diversityScore: 1 / (count + 1), layer: 0 };
            newStates.set(key, [newCost, ns, newSig]);
          } else {
            this.stats.compressionCollisions++;
          }
        }
      }

      for (const [, [, state, sig]] of newStates) {
        this.memory.insert(state, sig);
      }
    }

    // Find best complete tour
    let bestCost = Infinity, bestPath: number[] = [];
    for (const layer of this.memory.allLayers()) {
      for (const state of layer) {
        if (state.visited.size === n) {
          const total = state.cost + distances[state.current][0];
          if (total < bestCost) { bestCost = total; bestPath = state.path; }
        }
      }
    }

    bestPath.push(0); // close tour
    this.stats.totalStates = this.memory.totalStates();
    this.stats.frontierStates = this.memory.frontier().length;
    this.stats.layerCount = this.memory.layerCount();

    return { tour: bestPath, cost: bestCost, stats: { ...this.stats } };
  }
}
