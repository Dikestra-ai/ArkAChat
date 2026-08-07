# ArkAChat

**Quantum-resistant messaging** by Dikestra AI — zero-identifier, end-to-end encrypted with Shield.

[![Android CI](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-android.yml/badge.svg)](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-android.yml)
[![Web CI](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-web.yml/badge.svg)](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-web.yml)
[![Desktop CI](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-desktop.yml/badge.svg)](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-desktop.yml)
[![Erlang CI](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-erlang.yml/badge.svg)](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-erlang.yml)

---

## Install

### Android APK (sideload)

> Latest debug build from CI — no Play Store required.

1. On your Android device, enable **Settings → Security → Install unknown apps** for your browser
2. Download the APK:

**[⬇ Download ArkAChat.apk (latest)](https://nightly.link/Dikestra-ai/ArkAChat/workflows/ci-android/main/arkachat-debug.zip)**

> Or grab any build directly from [Actions → Android CI](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-android.yml) → pick a run → **Artifacts → arkachat-debug**

### Desktop

| Platform | Download |
|----------|----------|
| Linux    | [Actions → Desktop CI](https://github.com/Dikestra-ai/ArkAChat/actions/workflows/ci-desktop.yml) → artifact `arkachat-linux` (`.AppImage`) |
| macOS    | artifact `arkachat-macos` (`.dmg`) |
| Windows  | artifact `arkachat-windows` (`.exe`) |

Stable releases (signed) are published at [Releases](https://github.com/Dikestra-ai/ArkAChat/releases) when a `v*.*.*` tag is pushed.

### Web

```bash
cd arkachat-web
npm install
npm run dev        # http://localhost:3000
```

---

## Security

| Layer | Technology |
|-------|-----------|
| Encryption | **Shield v2** — AES-256-GCM with EXPTIME-secure ratchet, 32–128 byte random padding |
| Transport | **SimpleX** — zero-identifier queues, ephemeral delivery, no phone number |
| Key storage | Android Keystore (hardware-backed) / OS Keychain (desktop) |

Wire format: `0x13 | 0x01 | nonce(12) | AES-256-GCM(inner) | tag(16)` — compatible across Android, Web, and Erlang backends.

---

## Architecture

```
arkachat-android/    Kotlin + Jetpack Compose (minSdk 26)
arkachat-web/        Next.js 14 + React + Shield WASM
arkachat-desktop/    Electron 28 wrapping the web app
arkachat-nitrogen/   Erlang/OTP + Nitrogen framework (Telegram-like UI, bots)
```

### Nitrogen (Erlang) features
- Telegram-style chat list with DMs, groups, and bots
- Built-in `bot-echo` and `bot-status` bots; add more at runtime via `bot_sup:add_bot/2`
- Shield-encrypted message store (ETS-backed, AES-256-GCM wire-compatible)
- 34 EUnit tests covering Shield wire format, crypto correctness, and bot framework

---

## Build

### Android
```bash
cd arkachat-android
./gradlew assembleDebug          # outputs app/build/outputs/apk/debug/app-debug.apk
./gradlew test
```

### Web
```bash
cd arkachat-web
npm install && npm run dev
```

### Desktop
```bash
cd arkachat-web  && npm install && npm run build   # build renderer first
cd arkachat-desktop && npm install
npm run build:linux    # or :mac / :windows
```

### Erlang/Nitrogen
```bash
cd arkachat-nitrogen/app
chmod +x do-plugins.escript copy_static.escript etc/assemble_config.escript
rebar3 as test compile
# Run all 34 EUnit tests:
./run_tests.sh
```

---

## License

MIT © 2026 Dikestra AI
