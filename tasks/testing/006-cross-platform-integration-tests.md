---
id: testing-006
title: "Cross-Platform Integration Tests"
status: todo
priority: high
tags: [testing, integration, cross-platform, android, web]
dependencies: [testing-003, testing-004, testing-005]
assignee: developer
created: 2026-01-20T21:00:00Z
estimate: 4h
complexity: 4
area: testing
---

# Cross-Platform Integration Tests

## Context
Test that Android and Web apps can communicate with each other through the Shield encryption and SimpleX messaging layers.

## Objectives
- Verify Android ↔ Web message compatibility
- Test QR pairing between platforms
- Verify file transfer across platforms
- Ensure encryption compatibility

## Tasks
- [ ] Set up test infrastructure (Android emulator + Web browser)
- [ ] Write Android → Web message test
- [ ] Write Web → Android message test
- [ ] Write cross-platform file transfer test
- [ ] Write cross-platform QR pairing test
- [ ] Test message status sync across platforms
- [ ] Test typing indicators cross-platform

## Technical Details

### Test Infrastructure
```
┌─────────────────┐         ┌─────────────────┐
│ Android Emulator│   SMP   │   Web Browser   │
│                 │ ◄─────► │   (Playwright)  │
│ Running ChatGuard│        │ Running ChatGuard│
└─────────────────┘         └─────────────────┘
        │                           │
        └───────── Shared ──────────┘
              Test Vectors
```

### Test Setup
```kotlin
// Android test
@RunWith(AndroidJUnit4::class)
class CrossPlatformTest {

    @Test
    fun android_sendsMessage_web_receives() {
        // 1. Create invitation on Android
        val invitation = createAndroidInvitation()

        // 2. Send invitation to Web via test channel
        sendToTestChannel("invitation", invitation)

        // 3. Web accepts invitation (via Playwright)
        webDriver.acceptInvitation(invitation)

        // 4. Android sends message
        sendAndroidMessage("Hello from Android!")

        // 5. Verify Web receives
        val received = waitForWebMessage()
        assertEquals("Hello from Android!", received)
    }
}
```

### Test Channel
Use a shared file or local server for test coordination:
```typescript
// test-channel.ts
export class TestChannel {
    private server: http.Server;

    constructor() {
        this.server = http.createServer((req, res) => {
            // Handle test coordination
        });
    }

    async sendToAndroid(type: string, data: string) {
        await fetch('http://localhost:9999/android', {
            method: 'POST',
            body: JSON.stringify({ type, data })
        });
    }

    async waitForAndroid(type: string): Promise<string> {
        return new Promise(resolve => {
            // Wait for Android to send data
        });
    }
}
```

### Cross-Platform Tests
```typescript
// cross-platform.test.ts
describe('Cross-Platform Communication', () => {
    let android: AndroidDriver;
    let web: PlaywrightPage;
    let channel: TestChannel;

    beforeAll(async () => {
        channel = new TestChannel();
        await channel.start();

        android = await AndroidDriver.connect();
        web = await playwright.chromium.launch();
    });

    test('Web sends message, Android receives', async () => {
        // Setup: pair devices via QR
        const qrData = await android.createInvitation();
        await web.acceptInvitation(qrData);

        // Web sends message
        await web.sendMessage('Hello from Web!');

        // Android receives
        const message = await android.waitForMessage();
        expect(message.content).toBe('Hello from Web!');
        expect(message.decrypted).toBe(true);
    });

    test('File sent from Android, downloads on Web', async () => {
        // Android sends file
        await android.sendFile('test-image.png');

        // Web receives and downloads
        const file = await web.downloadFile();
        expect(file.name).toBe('test-image.png');
        expect(file.size).toBeGreaterThan(0);
    });

    test('Message status syncs across platforms', async () => {
        // Android sends message
        const msgId = await android.sendMessage('Status test');

        // Check sent status
        expect(await android.getMessageStatus(msgId)).toBe('sent');

        // Web receives → delivered
        await web.waitForMessage();
        expect(await android.getMessageStatus(msgId)).toBe('delivered');

        // Web opens chat → read
        await web.openChat();
        expect(await android.getMessageStatus(msgId)).toBe('read');
    });
});
```

### Run Tests
```bash
# Start Android emulator
emulator -avd Pixel_6_API_33 &

# Install Android app
cd chatguard-android && ./gradlew installDebug

# Start Web app
cd chatguard-web && npm run dev &

# Run cross-platform tests
npm run test:cross-platform
```

## CI Configuration
```yaml
name: Cross-Platform Tests

on: [push]

jobs:
  cross-platform:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Android Emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          script: |
            cd chatguard-android
            ./gradlew installDebug

      - name: Start Web App
        run: |
          cd chatguard-web
          npm ci
          npm run build
          npm start &

      - name: Run Cross-Platform Tests
        run: npm run test:cross-platform
```

## Acceptance Criteria
- [ ] Android message decrypts correctly on Web
- [ ] Web message decrypts correctly on Android
- [ ] QR pairing works between platforms
- [ ] Files transfer correctly between platforms
- [ ] Message status updates sync
- [ ] Tests run in CI
