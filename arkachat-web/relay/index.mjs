/**
 * ArkAChat Local WebSocket Relay
 *
 * In-memory message relay for development. Lets the web UI (Firefox on
 * localhost:3003) and the Android WebView (loading 10.0.2.2:3003) exchange
 * encrypted messages without needing the public SMP servers.
 *
 * Listens on port 3004. Both clients connect to the same relay using their
 * respective hostnames (localhost vs 10.0.2.2 — both reach the same process).
 *
 * Protocol: JSON over WebSocket
 *
 * Client → Relay:
 *   {"cmd":"NEW","queueId":"<b64>","recipientKey":"<b64>"}  → creates a queue
 *   {"cmd":"SUB","queueId":"<b64>"}                         → subscribe
 *   {"cmd":"SEND","queueId":"<b64>","msgId":"<b64>","data":"<b64>"} → send
 *   {"cmd":"ACK","queueId":"<b64>","msgId":"<b64>"}         → ack
 *
 * Relay → Client:
 *   {"cmd":"OK","queueId":"<b64>"}                          → queue created
 *   {"cmd":"MSG","queueId":"<b64>","msgId":"<b64>","data":"<b64>"} → message
 *   {"cmd":"ERR","error":"<string>"}                        → error
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomBytes } from 'crypto';

const PORT = parseInt(process.env.RELAY_PORT || '3004', 10);

// Queue state: queueId → { recipientKey, subscriber: WebSocket|null, pending: Message[] }
const queues = new Map();

// Message state: msgId → { queueId, data }
const messages = new Map();

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', queues: queues.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientAddr = req.socket.remoteAddress;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { cmd: 'ERR', error: 'invalid JSON' });
      return;
    }

    const { cmd, id } = msg; // id echoed back for RPC correlation

    switch (cmd) {
      case 'NEW': {
        const { queueId, recipientKey } = msg;
        if (!queueId || !recipientKey) {
          send(ws, { cmd: 'ERR', id, error: 'NEW: missing queueId or recipientKey' });
          return;
        }
        if (queues.has(queueId)) {
          send(ws, { cmd: 'ERR', id, error: 'queue already exists' });
          return;
        }
        queues.set(queueId, { recipientKey, subscriber: null, pending: [] });
        send(ws, { cmd: 'OK', id, queueId });
        console.log(`[relay] NEW queue ${queueId.slice(0, 8)}... from ${clientAddr}`);
        break;
      }

      case 'SUB': {
        const { queueId } = msg;
        const queue = queues.get(queueId);
        if (!queue) {
          send(ws, { cmd: 'ERR', id, error: `queue not found: ${queueId}` });
          return;
        }
        queue.subscriber = ws;
        send(ws, { cmd: 'OK', id, queueId });
        console.log(`[relay] SUB queue ${queueId.slice(0, 8)}... from ${clientAddr}`);
        // Deliver any pending messages
        for (const { msgId, data } of queue.pending) {
          send(ws, { cmd: 'MSG', queueId, msgId, data });
        }
        queue.pending = [];
        break;
      }

      case 'SEND': {
        const { queueId, msgId, data } = msg;
        if (!queueId || !data) {
          send(ws, { cmd: 'ERR', id, error: 'SEND: missing queueId or data' });
          return;
        }
        const queue = queues.get(queueId);
        if (!queue) {
          send(ws, { cmd: 'ERR', id, error: `queue not found: ${queueId}` });
          return;
        }
        const assignedMsgId = msgId || randomBytes(16).toString('base64url');
        messages.set(assignedMsgId, { queueId, data });

        if (queue.subscriber && queue.subscriber.readyState === 1 /* OPEN */) {
          send(queue.subscriber, { cmd: 'MSG', queueId, msgId: assignedMsgId, data });
        } else {
          queue.pending.push({ msgId: assignedMsgId, data });
        }
        send(ws, { cmd: 'OK', id, queueId, msgId: assignedMsgId });
        console.log(`[relay] SEND → queue ${queueId.slice(0, 8)}... msg ${assignedMsgId.slice(0, 8)}...`);
        break;
      }

      case 'ACK': {
        const { msgId } = msg;
        if (msgId) messages.delete(msgId);
        send(ws, { cmd: 'OK', id });
        break;
      }

      default:
        send(ws, { cmd: 'ERR', id, error: `unknown command: ${cmd}` });
    }
  });

  ws.on('close', () => {
    // Unsubscribe this socket from any queue it subscribed to
    for (const [, queue] of queues) {
      if (queue.subscriber === ws) {
        queue.subscriber = null;
      }
    }
  });
});

function send(ws, obj) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(obj));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[relay] ArkAChat local relay listening on ws://0.0.0.0:${PORT}`);
  console.log(`[relay] Browser → ws://localhost:${PORT}`);
  console.log(`[relay] Android  → ws://10.0.2.2:${PORT}`);
});
