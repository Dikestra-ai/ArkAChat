---
id: testing-004
title: "DOMGuard E2E Tests for Web Chat"
status: done
priority: high
tags: [testing, e2e, domguard, web, browser-automation]
dependencies: [frontend-002]
assignee: developer
created: 2026-01-20T21:00:00Z
estimate: 4h
complexity: 3
area: testing
---

# DOMGuard E2E Tests for Web Chat

## Context
Use DOMGuard browser automation to test the complete web chat flow end-to-end.
DOMGuard provides CSS selector-based element interaction for reliable E2E testing.

## Objectives
- Test complete user flows in real browser
- Verify QR code pairing works
- Test message sending and receiving
- Test file attachment flow
- Ensure cross-browser compatibility

## Tasks
- [ ] Set up DOMGuard test environment
- [ ] Write contact pairing E2E test
- [ ] Write message sending E2E test
- [ ] Write message receiving E2E test
- [ ] Write file attachment E2E test
- [ ] Write encrypted file download E2E test
- [ ] Write error handling E2E tests
- [ ] Set up CI integration for E2E tests

## Technical Details

### DOMGuard Setup
```typescript
// tests/e2e/setup.ts
import { DOMGuard } from '@anthropic/domguard';

export async function setupTestBrowser() {
    const domguard = new DOMGuard({
        browser: 'chromium',
        headless: process.env.CI === 'true',
        baseUrl: 'http://localhost:3000'
    });

    await domguard.launch();
    return domguard;
}

export async function createTestUser(domguard: DOMGuard, name: string) {
    // Navigate to app and set up a test user
    await domguard.navigate('/');
    await domguard.click('[data-testid="setup-button"]');
    await domguard.type('[data-testid="display-name-input"]', name);
    await domguard.click('[data-testid="save-button"]');
    await domguard.waitFor('[data-testid="contacts-list"]');
}
```

### Contact Pairing E2E Test
```typescript
// tests/e2e/contact-pairing.test.ts
import { describe, it, beforeAll, afterAll } from 'vitest';
import { DOMGuard } from '@anthropic/domguard';
import { setupTestBrowser, createTestUser } from './setup';

describe('Contact Pairing', () => {
    let alice: DOMGuard;
    let bob: DOMGuard;

    beforeAll(async () => {
        // Launch two browser instances for Alice and Bob
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

        // Get QR code data (in real test, would scan; here we extract data attribute)
        const qrData = await alice.getAttribute('[data-testid="qr-code"]', 'data-value');

        // Bob scans QR code (simulated by direct input)
        await bob.click('[data-testid="add-contact-button"]');
        await bob.click('[data-testid="scan-qr-button"]');

        // In test mode, we can paste the QR data directly
        await bob.type('[data-testid="qr-input-manual"]', qrData);
        await bob.click('[data-testid="submit-qr-button"]');

        // Verify contact appears for Bob
        await bob.waitFor('[data-testid="contact-item-Alice"]');

        // Verify contact appears for Alice (after connection confirmation)
        await alice.waitFor('[data-testid="contact-item-Bob"]', { timeout: 10000 });
    });
});
```

### Message Sending E2E Test
```typescript
// tests/e2e/messaging.test.ts
describe('Messaging', () => {
    let alice: DOMGuard;
    let bob: DOMGuard;

    // ... setup with paired contacts ...

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

        // Verify message status changes
        await alice.waitFor('[data-testid="message-status-sent"]');

        // Bob opens chat with Alice
        await bob.click('[data-testid="contact-item-Alice"]');
        await bob.waitFor('[data-testid="chat-screen"]');

        // Verify message appears in Bob's chat
        await bob.waitFor(`[data-testid="message-bubble"]:has-text("${testMessage}")`, {
            timeout: 10000
        });

        // Verify Alice sees delivered status
        await alice.waitFor('[data-testid="message-status-delivered"]', {
            timeout: 5000
        });
    });

    it('should show read receipts', async () => {
        // Bob reads the message (chat already open)
        // Alice should see read status
        await alice.waitFor('[data-testid="message-status-read"]', {
            timeout: 5000
        });
    });
});
```

### File Attachment E2E Test
```typescript
// tests/e2e/file-transfer.test.ts
describe('File Transfer', () => {
    it('should send and receive file', async () => {
        // Alice opens chat with Bob
        await alice.click('[data-testid="contact-item-Bob"]');

        // Alice attaches file
        await alice.click('[data-testid="attach-button"]');

        // Upload test file (DOMGuard handles file input)
        await alice.uploadFile('[data-testid="file-input"]', 'tests/fixtures/test-image.png');

        // Wait for upload and encryption
        await alice.waitFor('[data-testid="file-message"]', { timeout: 30000 });

        // Bob opens chat
        await bob.click('[data-testid="contact-item-Alice"]');

        // Bob sees file message
        await bob.waitFor('[data-testid="file-message"]', { timeout: 10000 });

        // Bob downloads file (decrypted)
        await bob.click('[data-testid="download-decrypted-button"]');

        // Verify download started (browser download API)
        // In test, we verify the download trigger was called
        await bob.waitFor('[data-testid="download-complete"]', { timeout: 10000 });
    });

    it('should download file encrypted for backup', async () => {
        await bob.click('[data-testid="file-options-button"]');
        await bob.click('[data-testid="download-encrypted-button"]');

        // Verify encrypted file downloaded
        await bob.waitFor('[data-testid="download-complete"]');
    });
});
```

### Error Handling E2E Tests
```typescript
// tests/e2e/error-handling.test.ts
describe('Error Handling', () => {
    it('should handle network disconnection gracefully', async () => {
        // Simulate offline
        await alice.setOfflineMode(true);

        // Try to send message
        await alice.type('[data-testid="message-input"]', 'Offline message');
        await alice.click('[data-testid="send-button"]');

        // Should show pending/failed status
        await alice.waitFor('[data-testid="message-status-failed"]');

        // Reconnect
        await alice.setOfflineMode(false);

        // Retry should work
        await alice.click('[data-testid="retry-button"]');
        await alice.waitFor('[data-testid="message-status-sent"]');
    });

    it('should handle invalid QR code', async () => {
        await bob.click('[data-testid="add-contact-button"]');
        await bob.click('[data-testid="scan-qr-button"]');
        await bob.type('[data-testid="qr-input-manual"]', 'invalid-qr-data');
        await bob.click('[data-testid="submit-qr-button"]');

        // Should show error
        await bob.waitFor('[data-testid="error-message"]:has-text("Invalid QR code")');
    });
});
```

### Test Data Attributes
Add these to React components:
```typescript
// data-testid attributes for DOMGuard
<button data-testid="add-contact-button">Add Contact</button>
<button data-testid="show-qr-button">Show QR Code</button>
<button data-testid="scan-qr-button">Scan QR Code</button>
<div data-testid="qr-code" data-value={qrData}>...</div>
<input data-testid="message-input" />
<button data-testid="send-button">Send</button>
<div data-testid="message-bubble">...</div>
<span data-testid="message-status-sent">...</span>
<span data-testid="message-status-delivered">...</span>
<span data-testid="message-status-read">...</span>
```

### CI Configuration
```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd arkachat-web && npm ci

      - name: Build
        run: cd arkachat-web && npm run build

      - name: Start server
        run: cd arkachat-web && npm start &

      - name: Run E2E tests
        run: cd arkachat-web && npm run test:e2e
        env:
          CI: true
```

## Acceptance Criteria
- [ ] All E2E tests pass in CI
- [ ] Tests run in under 5 minutes
- [ ] Tests are reliable (no flaky tests)
- [ ] Coverage includes happy path and error cases
- [ ] Tests work in Chrome and Firefox
