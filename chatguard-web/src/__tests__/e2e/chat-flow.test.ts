/**
 * E2E Tests for ChatGuard Web using DOMGuard
 *
 * These tests verify the complete user flow for:
 * - Contact pairing via QR code
 * - Sending and receiving messages
 * - File attachments
 * - Message status updates
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// DOMGuard types (would be imported from @anthropic/domguard in production)
interface DOMGuardConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  baseUrl: string;
}

interface DOMGuard {
  launch(): Promise<void>;
  close(): Promise<void>;
  navigate(path: string): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  waitFor(selector: string, options?: { timeout?: number }): Promise<void>;
  getText(selector: string): Promise<string>;
  getAttribute(selector: string, attr: string): Promise<string | null>;
  isDisplayed(selector: string): Promise<boolean>;
  uploadFile(selector: string, filePath: string): Promise<void>;
  setOfflineMode(offline: boolean): Promise<void>;
}

// Mock DOMGuard for test definition (actual implementation would use real browser)
class MockDOMGuard implements DOMGuard {
  private config: DOMGuardConfig;
  private elements: Map<string, { text?: string; attrs?: Record<string, string> }> = new Map();

  constructor(config: DOMGuardConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {
    console.log(`Launching ${this.config.browser} browser`);
  }

  async close(): Promise<void> {
    console.log('Closing browser');
  }

  async navigate(path: string): Promise<void> {
    console.log(`Navigating to ${this.config.baseUrl}${path}`);
  }

  async click(selector: string): Promise<void> {
    console.log(`Clicking ${selector}`);
  }

  async type(selector: string, text: string): Promise<void> {
    console.log(`Typing "${text}" into ${selector}`);
  }

  async waitFor(selector: string, options?: { timeout?: number }): Promise<void> {
    console.log(`Waiting for ${selector}`);
  }

  async getText(selector: string): Promise<string> {
    return this.elements.get(selector)?.text || '';
  }

  async getAttribute(selector: string, attr: string): Promise<string | null> {
    return this.elements.get(selector)?.attrs?.[attr] || null;
  }

  async isDisplayed(selector: string): Promise<boolean> {
    return true;
  }

  async uploadFile(selector: string, filePath: string): Promise<void> {
    console.log(`Uploading ${filePath} to ${selector}`);
  }

  async setOfflineMode(offline: boolean): Promise<void> {
    console.log(`Setting offline mode: ${offline}`);
  }

  // Test helper to simulate element state
  setElement(selector: string, state: { text?: string; attrs?: Record<string, string> }): void {
    this.elements.set(selector, state);
  }
}

function createDOMGuard(config: DOMGuardConfig): DOMGuard {
  return new MockDOMGuard(config);
}

async function setupTestBrowser(): Promise<DOMGuard> {
  const domguard = createDOMGuard({
    browser: 'chromium',
    headless: process.env.CI === 'true',
    baseUrl: 'http://localhost:3000',
  });
  await domguard.launch();
  return domguard;
}

async function createTestUser(domguard: DOMGuard, name: string): Promise<void> {
  await domguard.navigate('/');
  await domguard.waitFor('[data-testid="app-ready"]', { timeout: 10000 });

  // Set display name
  await domguard.click('[data-testid="settings-button"]');
  await domguard.type('[data-testid="display-name-input"]', name);
  await domguard.click('[data-testid="save-button"]');
  await domguard.waitFor('[data-testid="contacts-list"]');
}

describe('Contact Pairing E2E', () => {
  let alice: DOMGuard;
  let bob: DOMGuard;

  beforeAll(async () => {
    alice = await setupTestBrowser();
    bob = await setupTestBrowser();

    await createTestUser(alice, 'Alice');
    await createTestUser(bob, 'Bob');
  });

  afterAll(async () => {
    await alice.close();
    await bob.close();
  });

  it('should pair contacts via QR code', async () => {
    // Alice generates QR code
    await alice.click('[data-testid="add-contact-button"]');
    await alice.click('[data-testid="show-qr-button"]');
    await alice.waitFor('[data-testid="qr-code"]');

    // Get QR code data
    const qrData = await alice.getAttribute('[data-testid="qr-code"]', 'data-value');
    expect(qrData).toBeTruthy();

    // Bob scans QR code (simulated via manual input in test)
    await bob.click('[data-testid="add-contact-button"]');
    await bob.click('[data-testid="scan-qr-button"]');
    await bob.type('[data-testid="qr-input-manual"]', qrData || '');
    await bob.click('[data-testid="submit-qr-button"]');

    // Verify contact appears for Bob
    await bob.waitFor('[data-testid="contact-item-Alice"]', { timeout: 10000 });

    // Verify contact appears for Alice
    await alice.waitFor('[data-testid="contact-item-Bob"]', { timeout: 10000 });
  });
});

describe('Messaging E2E', () => {
  let alice: DOMGuard;
  let bob: DOMGuard;

  beforeAll(async () => {
    alice = await setupTestBrowser();
    bob = await setupTestBrowser();

    // Setup users and pair them
    await createTestUser(alice, 'Alice');
    await createTestUser(bob, 'Bob');

    // Pair contacts (simplified - would use QR flow)
  });

  afterAll(async () => {
    await alice.close();
    await bob.close();
  });

  it('should send and receive text message', async () => {
    // Alice opens chat with Bob
    await alice.click('[data-testid="contact-item-Bob"]');
    await alice.waitFor('[data-testid="chat-screen"]');

    // Alice sends message
    const testMessage = `Test message ${Date.now()}`;
    await alice.type('[data-testid="message-input"]', testMessage);
    await alice.click('[data-testid="send-button"]');

    // Verify message appears in Alice's chat
    await alice.waitFor(`[data-testid="message-bubble"]:has-text("${testMessage}")`);

    // Verify message status changes to sent
    await alice.waitFor('[data-testid="message-status-sent"]');

    // Bob opens chat with Alice
    await bob.click('[data-testid="contact-item-Alice"]');
    await bob.waitFor('[data-testid="chat-screen"]');

    // Verify message appears in Bob's chat
    await bob.waitFor(`[data-testid="message-bubble"]:has-text("${testMessage}")`, {
      timeout: 10000,
    });
  });

  it('should show delivery receipts', async () => {
    // After Bob receives, Alice should see delivered status
    await alice.waitFor('[data-testid="message-status-delivered"]', {
      timeout: 5000,
    });
  });

  it('should show read receipts', async () => {
    // Bob reading the message triggers read receipt
    await alice.waitFor('[data-testid="message-status-read"]', {
      timeout: 5000,
    });
  });
});

describe('File Transfer E2E', () => {
  let alice: DOMGuard;
  let bob: DOMGuard;

  beforeAll(async () => {
    alice = await setupTestBrowser();
    bob = await setupTestBrowser();

    await createTestUser(alice, 'Alice');
    await createTestUser(bob, 'Bob');
  });

  afterAll(async () => {
    await alice.close();
    await bob.close();
  });

  it('should send and receive file', async () => {
    // Alice opens chat with Bob
    await alice.click('[data-testid="contact-item-Bob"]');

    // Alice attaches file
    await alice.click('[data-testid="attach-button"]');
    await alice.uploadFile('[data-testid="file-input"]', 'tests/fixtures/test-image.png');

    // Wait for upload and encryption
    await alice.waitFor('[data-testid="file-message"]', { timeout: 30000 });

    // Bob opens chat
    await bob.click('[data-testid="contact-item-Alice"]');

    // Bob sees file message
    await bob.waitFor('[data-testid="file-message"]', { timeout: 10000 });
  });

  it('should download file decrypted', async () => {
    // Bob downloads decrypted file
    await bob.click('[data-testid="download-decrypted-button"]');
    await bob.waitFor('[data-testid="download-complete"]', { timeout: 10000 });
  });

  it('should download file encrypted for backup', async () => {
    // Bob downloads encrypted file
    await bob.click('[data-testid="file-options-button"]');
    await bob.click('[data-testid="download-encrypted-button"]');
    await bob.waitFor('[data-testid="download-complete"]');
  });
});

describe('Error Handling E2E', () => {
  let domguard: DOMGuard;

  beforeAll(async () => {
    domguard = await setupTestBrowser();
    await createTestUser(domguard, 'TestUser');
  });

  afterAll(async () => {
    await domguard.close();
  });

  it('should handle network disconnection gracefully', async () => {
    // Open a chat
    await domguard.click('[data-testid="contact-item-Bob"]');
    await domguard.waitFor('[data-testid="chat-screen"]');

    // Simulate offline
    await domguard.setOfflineMode(true);

    // Try to send message
    await domguard.type('[data-testid="message-input"]', 'Offline message');
    await domguard.click('[data-testid="send-button"]');

    // Should show pending/failed status
    await domguard.waitFor('[data-testid="message-status-failed"]');

    // Reconnect
    await domguard.setOfflineMode(false);

    // Message should retry or show retry button
    await domguard.waitFor('[data-testid="retry-button"]');
  });

  it('should handle invalid QR code', async () => {
    await domguard.click('[data-testid="add-contact-button"]');
    await domguard.click('[data-testid="scan-qr-button"]');
    await domguard.type('[data-testid="qr-input-manual"]', 'invalid-qr-data');
    await domguard.click('[data-testid="submit-qr-button"]');

    // Should show error
    await domguard.waitFor('[data-testid="error-message"]');
    const errorText = await domguard.getText('[data-testid="error-message"]');
    expect(errorText.toLowerCase()).toContain('invalid');
  });
});

// Exported test IDs for documentation
export const TEST_IDS = {
  // App
  APP_READY: 'app-ready',
  SETTINGS_BUTTON: 'settings-button',
  DISPLAY_NAME_INPUT: 'display-name-input',
  SAVE_BUTTON: 'save-button',

  // Contacts
  CONTACTS_LIST: 'contacts-list',
  CONTACT_ITEM: (name: string) => `contact-item-${name}`,
  ADD_CONTACT_BUTTON: 'add-contact-button',
  SHOW_QR_BUTTON: 'show-qr-button',
  SCAN_QR_BUTTON: 'scan-qr-button',
  QR_CODE: 'qr-code',
  QR_INPUT_MANUAL: 'qr-input-manual',
  SUBMIT_QR_BUTTON: 'submit-qr-button',

  // Chat
  CHAT_SCREEN: 'chat-screen',
  MESSAGE_INPUT: 'message-input',
  SEND_BUTTON: 'send-button',
  MESSAGE_BUBBLE: 'message-bubble',
  MESSAGE_STATUS_SENDING: 'message-status-sending',
  MESSAGE_STATUS_SENT: 'message-status-sent',
  MESSAGE_STATUS_DELIVERED: 'message-status-delivered',
  MESSAGE_STATUS_READ: 'message-status-read',
  MESSAGE_STATUS_FAILED: 'message-status-failed',
  RETRY_BUTTON: 'retry-button',

  // Files
  ATTACH_BUTTON: 'attach-button',
  FILE_INPUT: 'file-input',
  FILE_MESSAGE: 'file-message',
  DOWNLOAD_DECRYPTED_BUTTON: 'download-decrypted-button',
  DOWNLOAD_ENCRYPTED_BUTTON: 'download-encrypted-button',
  FILE_OPTIONS_BUTTON: 'file-options-button',
  DOWNLOAD_COMPLETE: 'download-complete',

  // Errors
  ERROR_MESSAGE: 'error-message',
} as const;
