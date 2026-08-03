---
id: backend-013
title: "Android: Start MessageSyncService for Background Message Reception"
status: done
priority: critical
tags:
- backend
- android
- simplex
dependencies:
- backend-008
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 3h
complexity: 4
area: backend
---

# Android: Start MessageSyncService for Background Message Reception

## Causation Chain
> `MessageSyncService` is declared in `AndroidManifest.xml` (line 44-47) and fully
> implemented in `MessageSyncService.kt`, BUT no code ever calls `startForegroundService()`
> to start it. `ArkAChatApp.onCreate()` calls `bridge.initialize()` which connects
> SimpleX for sending, but `MessageSyncService.onStartCommand()` is never invoked,
> so background message reception is dead code.
>
> Flow that should exist:
> `MainActivity.onCreate()` → `startForegroundService(MessageSyncService)` →
> `onStartCommand()` → `simplexClient.connect()` + `receiveMessages().collectLatest()`
> → `handleIncomingMessage()` → decrypt + save + notify

## Pre-flight Checks
- [ ] Read `arkachat-android/.../MainActivity.kt` — no service start call (confirmed)
- [ ] Read `arkachat-android/.../MessageSyncService.kt` — fully implemented but never started
- [ ] Read `arkachat-android/.../ArkAChatApp.kt` — `bridge.initialize()` only, no service
- [ ] Read `AndroidManifest.xml` — service declared with `foregroundServiceType="dataSync"`
- [ ] Verify FOREGROUND_SERVICE permission is declared (line 15-16 of manifest — confirmed)
- [ ] Check `POST_NOTIFICATIONS` permission is declared (line 12 — confirmed)

## Context
`MessageSyncService` is a foreground service that connects to SimpleX SMP servers and
listens for incoming encrypted messages. It handles decryption via Shield, saves to Room
database, and shows notifications. The service is fully implemented and declared in the
manifest, but `MainActivity` never starts it. This means users cannot receive messages
when the app is in the background or even in the foreground (since `bridge.initialize()`
in `ArkAChatApp` may not subscribe to all queues the service would).

## Tasks
- [ ] Add `startForegroundService()` call in `MainActivity.onCreate()` to start `MessageSyncService`
- [ ] Add runtime permission check for `POST_NOTIFICATIONS` (Android 13+) before starting service
- [ ] Prevent duplicate service starts (check if already running)
- [ ] Ensure `MessageSyncService` doesn't conflict with `bridge.initialize()` in `ArkAChatApp`
  - Either: Remove `bridge.initialize()` from `ArkAChatApp` and let service handle connection
  - Or: Coordinate so service and bridge share the same `SimpleXClient` instance
- [ ] Handle service lifecycle: restart on device boot if user was logged in
- [ ] Verify no duplicate SimpleX connections (service + bridge both calling `connect()`)
- [ ] Build + test + verify messages received in background

## Acceptance Criteria
- [ ] `MessageSyncService` starts on app launch
- [ ] Messages received when app is in background (notification shown)
- [ ] Messages received when app is in foreground (saved to database, UI updates)
- [ ] No duplicate SimpleX connections
- [ ] No dead code — service is actively used
- [ ] No warnings in build
- [ ] Runtime notification permission handled for Android 13+

## Notes
- `ArkAChatApp.simplexClient` is a shared instance — `MessageSyncService.onStartCommand()`
  accesses it via `(application as ArkAChatApp).simplexClient`
- Potential conflict: both `bridge.initialize()` and `MessageSyncService.onStartCommand()`
  call `simplexClient.connect()` — `SimpleXClient.connect()` guards against double-connect
  per server, so this should be safe, but verify
- FOREGROUND_SERVICE_DATA_SYNC type is already declared in manifest

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
