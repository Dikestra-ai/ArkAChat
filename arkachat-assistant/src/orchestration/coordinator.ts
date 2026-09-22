/**
 * Gibraltar-Code coordinator for arkachat-assistant.
 *
 * Registers the assistant as a named session, exposes emitEvent() for
 * publishing routing/draft events to other ArkAChat services, and
 * listens for tool-dispatch requests from web or proxy services.
 *
 * Gibraltar-Code is optional — the assistant works standalone if it
 * is not installed or not running.
 */
import { execSync, spawn, type ChildProcess } from 'child_process';
import { config } from '../config.js';

let initialized = false;
let listenerProc: ChildProcess | null = null;

export async function initOrchestration(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    execSync('gibraltar-code init', { stdio: 'pipe' });
    execSync(`gibraltar-code session register --name ${config.GIBRALTAR_SESSION_NAME}`, { stdio: 'pipe' });
    console.log('[orchestration] Gibraltar-Code session registered:', config.GIBRALTAR_SESSION_NAME);

    await emitEvent('assistant.ready', { version: '0.1.0', channels: getActiveChannels() });
    startMessageListener();
  } catch {
    console.warn('[orchestration] Gibraltar-Code not available, running standalone');
  }
}

/**
 * Publish a value to the Gibraltar-Code shared state store.
 * Other services read it via: gibraltar-code state get "<key>"
 */
export async function emitEvent(key: string, value: unknown): Promise<void> {
  try {
    const safe = JSON.stringify(value).replace(/'/g, "'\\''");
    execSync(`gibraltar-code state set "${key}" '${safe}'`, { stdio: 'pipe' });
  } catch {
    // Silently skip — Gibraltar-Code may not be running
  }
}

export async function sendToSession(target: string, message: string): Promise<void> {
  try {
    const safe = message.replace(/"/g, '\\"');
    execSync(`gibraltar-code send ${target} "${safe}"`, { stdio: 'pipe' });
  } catch {
    // Silently skip
  }
}

function getActiveChannels(): string[] {
  const channels = ['telegram'];
  if (config.ARKACHAT_PROXY_URL) channels.push('simplex');
  return channels;
}

function startMessageListener(): void {
  listenerProc = spawn('gibraltar-code', ['receive', '--wait'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  listenerProc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (!text) return;
    try {
      handleIncoming(JSON.parse(text) as unknown);
    } catch {
      console.debug('[orchestration] received:', text);
    }
  });

  listenerProc.on('close', () => {
    listenerProc = null;
    // Restart listener after a brief pause
    setTimeout(startMessageListener, 5000);
  });
}

function handleIncoming(msg: unknown): void {
  if (typeof msg !== 'object' || msg === null) return;
  const m = msg as Record<string, unknown>;
  // Tool-dispatch: { type: 'tool.dispatch', tool: string, args: object }
  if (m['type'] === 'tool.dispatch') {
    console.log('[orchestration] tool dispatch received:', m['tool']);
    // Future: route to dikestra-tools registry
  }
}
