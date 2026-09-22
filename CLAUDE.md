# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ArkAChat is a quantum-resistant messaging application combining:
- **SimpleX Chat Protocol**: Zero-identifier messaging (no phone numbers, pairwise connections only)
- **Dikestra AI Shield v2.4.1**: EXPTIME-secure encryption with forward secrecy

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

### Encryption Layer (Shield v2.4.1)
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

- **Rust**: `shield-core = "2.4.1"` (with `confidential` feature for TEE)
- **npm**: `@dikestra/shield`, `@dikestra/shield-browser`
- **Android**: `ai.guard8:shield-android:2.4.1`

## Task Management

Gibraltar-Task is active (migrated from TaskGuard). See `AGENTIC_AI_TASKGUARD_GUIDE.md`.
- View tasks: `gibraltar-task list`
- Create task: `gibraltar-task create --dependencies "setup-001"`
- Validate: `gibraltar-task validate`

## DOMGuard (Browser Automation)

DOMGuard is available for browser inspection. See `AGENTIC_AI_DOMGUARD_GUIDE.md`.
- Start Chrome: `chrome --remote-debugging-port=9222`
- Check connection: `domguard status`

## Adel Assistant (arkachat-assistant/)

Telegram + SimpleX AI assistant powered by the Adel engine (named after Savta Adel).
Role-aware routing: owner/employee → Scripts Bank → LLM fallback; client → RAG → Draft & Approve (human-in-the-loop).

```bash
cd arkachat-assistant
npm install
cp .env.example .env     # fill OPENROUTER_API_KEY + TELEGRAM_BOT_TOKEN
npm run dev              # tsx watch src/index.ts
```

Key files:
- `src/nanoclaw/orchestrator.ts` — role-aware routing with Gibraltar-Code event emission
- `src/orchestration/coordinator.ts` — Gibraltar-Code session + state broadcast
- `src/orchestration/dikestra-tools.ts` — Tool registry: Task, Flow, Api, Shield
- `src/channels/telegram.ts` — Telegram adapter (Telegraf)
- `src/channels/arkachat.ts` — SimpleX bridge (long-polls arkachat-proxy)

Environment additions (beyond original Adel):
| Var | Purpose |
|-----|---------|
| `ARKACHAT_PROXY_URL` | Enables SimpleX channel (optional) |
| `ARKACHAT_BRIDGE_SECRET` | Auth header for proxy requests |
| `GIBRALTAR_SESSION_NAME` | Gibraltar-Code session (default: `assistant`) |

## Dikestra Orchestrator (libs/dikestra-orchestrator/)

Shared TypeScript library used by all ArkAChat services to coordinate via Gibraltar-Code.

```typescript
import { createCoordinator, DikestTools } from '@arkachat/dikestra-orchestrator';

const coord = createCoordinator({ sessionName: 'web' });
coord.setState('web.ready', { ts: Date.now() });

// Read assistant events
const pending = coord.getState('assistant.draft_pending');

// Spawn a tracked task
DikestTools.createTask('/data/git/Dikestra-ai/ArkAChat', {
  title: 'Fix bug', area: 'auth', dependencies: 'setup-001',
});
```

## Gibraltar as Orchestrator

All ArkAChat services communicate via **Gibraltar-Code** shared state:

```
arkachat-web  ←──────────────────────────────→  arkachat-assistant
  (Next.js)     gibraltar-code state/messages       (Adel Telegram+SimpleX)
                          ↕
                  arkachat-proxy (SimpleX / Erlang Nitrogen)
```

State keys published by the assistant:
- `assistant.ready` — service up, lists active channels
- `assistant.routed` — message routed (route, handler, channel, userId)
- `assistant.draft_pending` — draft awaiting owner approval (draftId, businessId)
- `assistant.web_query` — query dispatched from web UI

Read from any service or shell: `gibraltar-code state get "assistant.draft_pending"`

Web API: `GET /api/assistant?action=status` and `POST /api/assistant` (see `arkachat-web/src/app/api/assistant/route.ts`)
