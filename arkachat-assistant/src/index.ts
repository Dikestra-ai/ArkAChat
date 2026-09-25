import 'dotenv/config';
import { startTelegram } from './channels/telegram.js';
import { startArkaChatBridge } from './channels/arkachat.js';
import { initOrchestration } from './orchestration/coordinator.js';
import { startArcHandshake } from './orchestration/arcHandshake.js';
import { startHttpServer } from './storage/http-server.js';
import './scripts/index.js';
import { config } from './config.js';

async function main() {
  // Register this service with Gibraltar-Code for cross-service coordination
  await initOrchestration();

  // CausaDB + Reasoning HTTP API (for web layer queries)
  startHttpServer();

  // ARC↔ArkAChat cross-session handshake (integration-006)
  startArcHandshake();

  const bot = startTelegram();

  // Start SimpleX bridge only when proxy URL is configured
  if (config.ARKACHAT_PROXY_URL) {
    startArkaChatBridge().catch((err) => {
      console.error('[arkachat-bridge] failed to start:', err);
    });
  }

  const shutdown = (signal: string) => {
    console.log(`received ${signal}, shutting down`);
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('startup error:', err);
  process.exit(1);
});
