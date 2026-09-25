/**
 * Dikestra tool registry for arkachat-assistant.
 *
 * Wraps Gibraltar CLI binaries (gibraltar-task, gibraltar-flow, gibraltar-api)
 * and the Shield CLI into typed async functions callable from the orchestrator
 * or from Adel scripts.
 */
import { execSync } from 'child_process';
import { emitEvent } from './coordinator.js';
import { optimizeRelays, type RelayMeasurement } from './graphemeRelay.js';

const ARKACHA_DIR = '/data/git/Dikestra-ai/ArkAChat';

export interface ToolResult {
  ok: boolean;
  data?: string;
  error?: string;
  durationMs: number;
}

function run(cmd: string, cwd = ARKACHA_DIR): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], cwd }).trim();
}

function timed<T>(fn: () => T): { result: T; durationMs: number } {
  const t = Date.now();
  const result = fn();
  return { result, durationMs: Date.now() - t };
}

/** Gibraltar-Task: create a tracked task in the ArkAChat causality graph. */
export function createTask(args: {
  title: string;
  area: string;
  dependencies: string;
  priority?: string;
  estimate?: string;
}): ToolResult {
  const t = Date.now();
  try {
    const flags = [
      `--title "${args.title}"`,
      `--area ${args.area}`,
      `--dependencies "${args.dependencies}"`,
      args.priority ? `--priority ${args.priority}` : '',
      args.estimate ? `--estimate "${args.estimate}"` : '',
    ].filter(Boolean).join(' ');
    const data = run(`gibraltar-task create ${flags}`);
    return { ok: true, data, durationMs: Date.now() - t };
  } catch (err) {
    return { ok: false, error: String(err), durationMs: Date.now() - t };
  }
}

/** Gibraltar-Task: mark a task done. */
export function doneTask(id: string): ToolResult {
  const t = Date.now();
  try {
    const data = run(`gibraltar-task update status ${id} done`);
    return { ok: true, data, durationMs: Date.now() - t };
  } catch (err) {
    return { ok: false, error: String(err), durationMs: Date.now() - t };
  }
}

/** Gibraltar-Flow: return the structure diagram of a source file. */
export function analyzeFile(filePath: string): ToolResult {
  const t = Date.now();
  try {
    const data = run(`gibraltar-flow analyze ${filePath}`, '/');
    return { ok: true, data, durationMs: Date.now() - t };
  } catch (err) {
    return { ok: false, error: String(err), durationMs: Date.now() - t };
  }
}

/** Gibraltar-Api: parse an OpenAPI/GraphQL/proto spec → Markdown. */
export function parseApiSpec(specPath: string, outputPath?: string): ToolResult {
  const t = Date.now();
  try {
    const out = outputPath ? `--output ${outputPath}` : '';
    const data = run(`gibraltar-api ${specPath} ${out}`, '/');
    return { ok: true, data, durationMs: Date.now() - t };
  } catch (err) {
    return { ok: false, error: String(err), durationMs: Date.now() - t };
  }
}

/** Broadcast a Gibraltar-Code state event to all registered sessions. */
export async function broadcastEvent(key: string, value: unknown): Promise<ToolResult> {
  const t = Date.now();
  await emitEvent(key, value);
  return { ok: true, durationMs: Date.now() - t };
}

/**
 * Shield CLI: encrypt plaintext (falls back to plaintext in dev).
 * Requires `shield` binary on PATH — provided by /data/git/Dikestra-ai/Shield.
 */
export function shieldEncrypt(plaintext: string, context?: string): ToolResult {
  const t = Date.now();
  try {
    const ctx = context ? ` --context "${context}"` : '';
    const safe = plaintext.replace(/'/g, "'\\''");
    const data = execSync(`echo '${safe}' | shield encrypt${ctx}`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { ok: true, data, durationMs: Date.now() - t };
  } catch {
    // Shield not installed — return plaintext (dev fallback)
    return { ok: true, data: plaintext, durationMs: Date.now() - t };
  }
}

/**
 * Grapheme relay optimizer — returns minimum-latency hop ordering for SMP relay nodes.
 *
 * Input: JSON array of { host, latencyMs, region? } measurements.
 * The web client should write measured latencies to Gibraltar-Code state key
 * `arkachat.relay.measurements` and Adel reads from there, or pass inline.
 *
 * Example call from a script:
 *   graphemeRelayOptimize('[{"host":"smp4.simplex.im","latencyMs":45,"region":"us"},...]')
 */
export function graphemeRelayOptimize(measurementsJson: string): ToolResult {
  const t = Date.now();
  try {
    const relays: RelayMeasurement[] = JSON.parse(measurementsJson);
    const result = optimizeRelays(relays);
    return { ok: true, data: result.explanation, durationMs: Date.now() - t };
  } catch (err) {
    return { ok: false, error: String(err), durationMs: Date.now() - t };
  }
}

export const tools = {
  createTask,
  doneTask,
  analyzeFile,
  parseApiSpec,
  broadcastEvent,
  shieldEncrypt,
  graphemeRelayOptimize,
};
