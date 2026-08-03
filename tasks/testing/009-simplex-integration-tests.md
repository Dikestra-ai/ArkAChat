---
id: testing-009
title: "SimpleX Service Integration Tests"
status: done
priority: high
tags:
- testing
- simplex
dependencies:
- backend-013
- backend-014
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 3h
complexity: 5
area: testing
---

# SimpleX Service Integration Tests

## Causation Chain
> After fixing MessageSyncService startup (backend-013) and eager bridge init (backend-014),
> we need integration tests to verify SimpleX connection lifecycle works end-to-end.

## Pre-flight Checks
- [ ] Read completed backend-013 and backend-014 task files
- [ ] Read existing test patterns in `arkachat-web/src/__tests__/e2e/`
- [ ] Read `arkachat-web/src/__tests__/shield-compatibility.test.ts` for test structure

## Context
The SimpleX connection must be established eagerly and maintained reliably across both
platforms. These tests verify the connection lifecycle, message reception, and reconnection
behavior after the wiring fixes.

## Tasks
- [ ] **Android instrumented tests**:
  - Test `MessageSyncService` starts on activity launch
  - Test service receives messages via `receiveMessages()` flow
  - Test service survives app background/foreground transitions
  - Test no duplicate SimpleX connections when service + bridge both active
- [ ] **Web integration tests**:
  - Test `BridgeProvider` initializes bridge on mount
  - Test SimpleX connection state propagates to UI
  - Test messages received on non-chat pages (landing, contacts)
  - Test bridge singleton — only one instance exists
- [ ] **Reconnection tests**:
  - Test auto-reconnect after WebSocket disconnect
  - Test queue re-subscription after reconnect
- [ ] Build + run all tests

## Acceptance Criteria
- [ ] Service startup test passes on Android
- [ ] Eager bridge init test passes on Web
- [ ] No duplicate connection tests pass
- [ ] Reconnection tests pass
- [ ] No dead code in test files

## Notes
- Android instrumented tests require emulator/device
- Web tests can mock WebSocket for unit tests

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
