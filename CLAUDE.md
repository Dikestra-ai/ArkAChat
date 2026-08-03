# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ArkAChat is a quantum-resistant messaging application combining:
- **SimpleX Chat Protocol**: Zero-identifier messaging (no phone numbers, pairwise connections only)
- **Dikestra AI Shield v1.1.0**: EXPTIME-secure encryption with forward secrecy

Target platforms: Android (Kotlin/Jetpack Compose), Web (React/Next.js), Desktop (Electron)

## Build Commands

### Android
```bash
cd arkachat-android
./gradlew assembleDebug          # Debug build
./gradlew assembleRelease        # Release build
./gradlew test                   # Run unit tests
./gradlew connectedAndroidTest   # Run instrumented tests
```

### Web
```bash
cd arkachat-web
npm install                      # Install dependencies
npm run dev                      # Development server (localhost:3000)
npm run build                    # Production build
npm run lint                     # Lint code
```

### Desktop
```bash
cd arkachat-desktop
npm install                      # Install dependencies
npm run dev                      # Development mode
npm run build:linux              # Build for Linux
npm run build:mac                # Build for macOS
npm run build:windows            # Build for Windows
```

## Architecture

### Directory Structure
```
arkachat-android/              # Android app (Kotlin, Jetpack Compose)
├── app/src/main/java/ai/dikestra/arkachat/
│   ├── crypto/                 # ShieldCrypto, KeyManager, BiometricAuth
│   ├── network/                # SimpleXClient, MessageSyncService
│   ├── storage/                # ChatDatabase (Room), EncryptedPrefs
│   ├── model/                  # Message, Contact data classes
│   ├── viewmodel/              # ChatViewModel, ContactsViewModel
│   └── ui/                     # Compose screens (Chat, Contacts, Settings)

arkachat-web/                  # Web app (Next.js 14, React)
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # React components
│   └── lib/
│       ├── shield/             # WebShieldCrypto (WASM integration)
│       ├── simplex/            # WebSimplexClient (WebSocket)
│       └── storage/            # Zustand store with persistence

arkachat-desktop/              # Desktop app (Electron)
├── main/                       # Electron main process
│   ├── index.js                # App entry, window management
│   ├── keystore.js             # OS keychain (keytar)
│   └── updater.js              # Auto-updater
```

### Encryption Layer (Shield v1.1.0)
- `RatchetSession`: Per-message encryption with forward secrecy
- `StreamCipher`: Large file encryption (~160 MB/s) for images/videos
- `SecureKeyStore`: Hardware-backed key storage (Android Keystore, OS Keychain)

### Transport Layer (SimpleX)
- Ephemeral message queues deleted after delivery
- WebSocket transport
- No user identifiers - pairwise queue IDs only

### Data Flow
1. User creates message → 2. Shield encrypts with RatchetSession → 3. SimpleX delivers via WebSocket → 4. Recipient decrypts → 5. Server deletes message

## Related Projects

- **Shield**: `/data/git/Dikestra-ai/Shield` - Core encryption library
- **DOMGuard**: `/data/git/Dikestra-ai/DOMGuard` - Browser security tools
- **TaskGuard**: `/data/git/Dikestra-ai/TaskGuard` - Task management

## Shield Dependencies

- **Rust**: `shield-core = "1.1"` (with `confidential` feature for TEE)
- **npm**: `@guard8/shield`, `@guard8/shield-browser`
- **Android**: `ai.guard8:shield-android:1.1.0`

## Task Management

TaskGuard is active in this project. See `AGENTIC_AI_TASKGUARD_GUIDE.md` for workflow.
- View tasks: `taskguard list`
- Create task: `taskguard create`
- Validate dependencies: `taskguard validate`

## DOMGuard (Browser Automation)

DOMGuard is available for browser inspection. See `AGENTIC_AI_DOMGUARD_GUIDE.md`.
- Start Chrome: `chrome --remote-debugging-port=9222`
- Check connection: `domguard status`
