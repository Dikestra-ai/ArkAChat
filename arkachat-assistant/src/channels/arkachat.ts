/**
 * ArkAChat SimpleX channel adapter.
 *
 * Long-polls the arkachat-proxy HTTP API so Adel can send/receive
 * messages over the SimpleX protocol (zero-metadata, no phone numbers).
 * Only activates when ARKACHAT_PROXY_URL is set.
 */
import { config } from '../config.js';
import { route } from '../nanoclaw/orchestrator.js';
import { findOrCreateByTelegram } from '../storage/users.js';

interface SimpleXMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
}

interface PendingResponse {
  messages: SimpleXMessage[];
}

const POLL_INTERVAL_MS = 3000;
let running = false;

export async function startArkaChatBridge(): Promise<void> {
  if (!config.ARKACHAT_PROXY_URL) return;
  running = true;
  console.log('[arkachat-bridge] starting, proxy:', config.ARKACHAT_PROXY_URL);
  poll();
}

export function stopArkaChatBridge(): void {
  running = false;
}

async function poll(): Promise<void> {
  if (!running) return;

  try {
    const resp = await fetch(`${config.ARKACHAT_PROXY_URL}/api/messages/pending`, {
      headers: buildHeaders(),
    });
    if (resp.ok) {
      const body = (await resp.json()) as PendingResponse;
      for (const msg of body.messages) {
        handleMessage(msg).catch((err) =>
          console.error('[arkachat-bridge] handleMessage error:', err)
        );
      }
    }
  } catch (err) {
    console.debug('[arkachat-bridge] poll error:', String(err));
  }

  setTimeout(poll, POLL_INTERVAL_MS);
}

async function handleMessage(msg: SimpleXMessage): Promise<void> {
  // Map the SimpleX contact handle to an Adel user record.
  // We derive a synthetic numeric ID from the handle so the same
  // user storage tables work across both Telegram and SimpleX channels.
  const syntheticId = hashHandle(msg.from);
  const { user } = await findOrCreateByTelegram({
    telegramId: syntheticId,
    displayName: msg.from.slice(0, 20),
    adminTelegramId: config.ADEL_ADMIN_TELEGRAM_ID,
  });

  const result = await route({ channel: 'simplex', user, query: msg.text });
  await sendReply(msg.from, result.reply);
}

async function sendReply(to: string, text: string): Promise<void> {
  if (!config.ARKACHAT_PROXY_URL) return;
  try {
    await fetch(`${config.ARKACHAT_PROXY_URL}/api/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildHeaders() },
      body: JSON.stringify({ to, text }),
    });
  } catch (err) {
    console.error('[arkachat-bridge] sendReply error:', err);
  }
}

function buildHeaders(): Record<string, string> {
  if (config.ARKACHAT_BRIDGE_SECRET) {
    return { 'X-Bridge-Secret': config.ARKACHAT_BRIDGE_SECRET };
  }
  return {};
}

/** FNV-1a hash → positive 32-bit int (deterministic synthetic Telegram ID). */
function hashHandle(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0 & 0x7fffffff) + 1;
}
