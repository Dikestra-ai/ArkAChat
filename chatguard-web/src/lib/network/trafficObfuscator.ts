import { type SMPQueueAddress, type WebSimplexClient } from '../simplex/client';
import { type WebShieldCrypto } from '../shield/crypto';
import { MessageType, type MessageEnvelope } from '../bridge/shieldSimplexBridge';

/**
 * Traffic obfuscation to prevent timing and pattern analysis.
 *
 * - Sends encrypted dummy messages at random intervals
 * - Dummy messages are indistinguishable from real messages on the wire
 * - Recipients silently discard DUMMY messages after decryption
 *
 * Configurable via enabled and intervalMs properties.
 */
export class TrafficObfuscator {
  enabled = true;
  intervalMs = 30_000; // Base interval between dummy messages

  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private crypto: WebShieldCrypto,
    private simplex: WebSimplexClient
  ) {}

  /**
   * Start sending dummy messages to a contact's queue.
   */
  startForContact(contactId: string, queue: SMPQueueAddress, isInitiator: boolean): void {
    if (this.timers.has(contactId)) return;
    this.scheduleDummy(contactId, queue, isInitiator);
  }

  /**
   * Stop sending dummy messages to a contact.
   */
  stopForContact(contactId: string): void {
    const timer = this.timers.get(contactId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(contactId);
    }
  }

  /**
   * Stop all dummy traffic.
   */
  stopAll(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  private scheduleDummy(contactId: string, queue: SMPQueueAddress, isInitiator: boolean): void {
    const jitter = Math.random() * this.intervalMs;
    const delay = this.intervalMs + jitter; // Random interval: 1x to 2x base

    const timer = setTimeout(async () => {
      if (!this.enabled) return;

      try {
        const envelope: MessageEnvelope = {
          type: MessageType.DUMMY,
          messageId: crypto.randomUUID(),
          timestamp: Date.now(),
        };
        const envelopeJson = JSON.stringify(envelope);
        const encrypted = await this.crypto.encryptMessage(contactId, isInitiator, envelopeJson);
        await this.simplex.sendMessage(queue, encrypted);
      } catch {
        // Silently ignore dummy message failures
      }

      // Schedule next dummy
      if (this.timers.has(contactId)) {
        this.scheduleDummy(contactId, queue, isInitiator);
      }
    }, delay);

    this.timers.set(contactId, timer);
  }
}
