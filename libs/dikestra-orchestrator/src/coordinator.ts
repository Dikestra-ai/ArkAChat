import { execSync, spawn, type ChildProcess } from 'child_process';
import type { OrchestratorEvent } from './types.js';

export interface CoordinatorOptions {
  sessionName: string;
  onEvent?: (event: OrchestratorEvent) => void;
}

export interface DikestOrchestrator {
  sessionName: string;
  setState(key: string, value: unknown): void;
  getState(key: string): unknown;
  send(target: string, message: string): void;
  receive(): string | null;
  lock(resource: string): void;
  unlock(resource: string): void;
  stop(): void;
}

export function createCoordinator(opts: CoordinatorOptions): DikestOrchestrator {
  let listenerProc: ChildProcess | null = null;

  const run = (cmd: string): string => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return '';
    }
  };

  run('gibraltar-code init');
  run(`gibraltar-code session register --name ${opts.sessionName}`);

  if (opts.onEvent) {
    const cb = opts.onEvent;
    listenerProc = spawn('gibraltar-code', ['receive', '--wait'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    listenerProc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (!text) return;
      try {
        cb({ key: 'message', value: JSON.parse(text) as unknown, timestamp: Date.now() });
      } catch {
        cb({ key: 'message', value: text, timestamp: Date.now() });
      }
    });
    listenerProc.on('close', () => { listenerProc = null; });
  }

  return {
    sessionName: opts.sessionName,
    setState(key, value) {
      const safe = JSON.stringify(value).replace(/'/g, "'\\''");
      run(`gibraltar-code state set "${key}" '${safe}'`);
    },
    getState(key) {
      const raw = run(`gibraltar-code state get "${key}"`);
      try { return JSON.parse(raw) as unknown; } catch { return raw || null; }
    },
    send(target, message) {
      run(`gibraltar-code send ${target} "${message.replace(/"/g, '\\"')}"`);
    },
    receive() {
      return run('gibraltar-code receive') || null;
    },
    lock(resource) { run(`gibraltar-code lock acquire "${resource}"`); },
    unlock(resource) { run(`gibraltar-code lock release "${resource}"`); },
    stop() { listenerProc?.kill(); },
  };
}
