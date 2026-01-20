---
id: setup-004
title: "Desktop App (Electron Wrapper)"
status: todo
priority: low
tags: [desktop, electron, setup]
dependencies: [setup-003, frontend-005]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 3h
complexity: 3
area: setup
---

# Desktop App (Electron Wrapper)

## Context
Create Electron wrapper for the web app to provide native desktop experience on Linux, macOS, and Windows.

## Objectives
- Set up Electron with Next.js export
- Configure native key storage (OS Keychain)
- Add system tray integration
- Enable native notifications

## Tasks
- [ ] Create `chatguard-desktop/` project
- [ ] Configure Electron main process
- [ ] Set up Next.js static export for renderer
- [ ] Integrate `keytar` for OS keychain
- [ ] Add system tray with menu
- [ ] Configure native notifications
- [ ] Set up auto-updater
- [ ] Create build scripts for all platforms

## Technical Details

### Project Structure
```
chatguard-desktop/
├── main/
│   ├── index.ts           # Electron main process
│   ├── keystore.ts        # OS keychain integration
│   ├── tray.ts            # System tray
│   └── updater.ts         # Auto-updater
├── renderer/              # Next.js export
├── package.json
└── electron-builder.yml
```

### Main Process
```typescript
// main/index.ts
import { app, BrowserWindow, Tray } from 'electron';
import { initKeystore } from './keystore';
import { createTray } from './tray';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  await initKeystore();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('renderer/index.html');
  createTray(mainWindow);
});
```

### OS Keychain (keytar)
```typescript
import * as keytar from 'keytar';

export async function storeKey(keyId: string, key: string): Promise<void> {
  await keytar.setPassword('ChatGuard', keyId, key);
}

export async function retrieveKey(keyId: string): Promise<string | null> {
  return keytar.getPassword('ChatGuard', keyId);
}
```

### Build Configuration
```yaml
# electron-builder.yml
appId: ai.guard8.chatguard
productName: ChatGuard
directories:
  output: dist
mac:
  category: public.app-category.social-networking
  target: [dmg, zip]
win:
  target: [nsis, portable]
linux:
  target: [AppImage, deb, rpm]
  category: Network
```

## Acceptance Criteria
- [ ] App launches on all platforms
- [ ] Keys stored in OS keychain
- [ ] System tray works
- [ ] Notifications appear
- [ ] Builds produce installers
