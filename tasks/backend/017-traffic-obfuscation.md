---
id: backend-017
title: "Traffic Obfuscation - Dummy Messages and Timing Randomization"
status: done
priority: medium
tags:
- backend
- security
- side-channel
dependencies:
- backend-016
- backend-015
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 5h
complexity: 6
area: backend
---

# Traffic Obfuscation - Dummy Messages and Timing Randomization

## Causation Chain
> Even with message padding (backend-016) and cert pinning (backend-015), an observer
> can still perform timing analysis:
> - Ping/pong at fixed 30s intervals → presence detection
> - Message burst patterns → conversation detection
> - Typing indicator frequency → typing speed fingerprinting
> - Group key distribution count → group member count
>
> Android: `SimpleXClient.kt` line 176 — `.pingInterval(30, TimeUnit.SECONDS)` — fixed
> Web: `client.ts` line 512 — `setTimeout(..., 5000)` — fixed reconnect delay

## Pre-flight Checks
- [ ] Read `arkachat-android/.../SimpleXClient.kt` line 176 — fixed ping interval
- [ ] Read `arkachat-web/src/lib/simplex/client.ts` — fixed reconnect timing
- [ ] Read `arkachat-web/src/lib/bridge/shieldSimplexBridge.ts` — typing indicator handling
- [ ] Understand SMP server behavior with dummy messages (will server forward them?)

## Context
Traffic analysis can reveal conversation patterns, user presence, and group membership
even with encrypted and padded messages. Obfuscation techniques break the correlation
between user actions and observable network events.

## Tasks
- [ ] **Ping interval randomization**:
  - Android: Randomize ping interval to 25-35s range per connection
  - Web: Add jitter to reconnect delays (3-7s instead of fixed 5s)
- [ ] **Dummy message injection**:
  - Create `TrafficObfuscator` class in both platforms
  - Periodically send encrypted dummy messages (distinguishable only by recipient)
  - Dummy messages are encrypted with Shield like real messages but with special type
  - Recipient silently discards dummy messages after decryption
  - Rate: configurable, default ~1 dummy per 30s per active connection
- [ ] **Typing indicator batching**:
  - Instead of sending typing indicator per keystroke, batch to fixed intervals
  - Send typing indicator at most once per 3 seconds
  - Pad typing indicators to same bucket size as regular messages
- [ ] **Group key distribution obfuscation**:
  - When distributing group keys, add dummy distributions to mask member count
  - E.g., always send exactly 10 key distribution messages regardless of group size
- [ ] Add `MessageType.DUMMY` to `MessageEnvelope` in bridge
- [ ] Both platforms: discard DUMMY messages silently on receipt
- [ ] Build + test + verify traffic patterns are less distinguishable

## Acceptance Criteria
- [ ] Ping intervals vary randomly per connection
- [ ] Dummy messages are indistinguishable from real messages on the wire
- [ ] Dummy messages are silently discarded by recipient
- [ ] Typing indicators are rate-limited and padded
- [ ] Group key distributions don't reveal member count
- [ ] No dead code, no stubs, no warnings
- [ ] Obfuscation is configurable (can be disabled for debugging)

## Notes
- Dummy messages consume bandwidth — make rate configurable
- Must add `DUMMY` to MessageType enum in both `shieldSimplexBridge.ts` and Android bridge
- SMP servers don't inspect message content, so dummy messages are safe to send
- Consider: dummy traffic should match typical conversation patterns statistically

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
