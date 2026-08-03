---
id: backend-012
title: "Shield Proxy Integration - Transport Layer Encryption"
status: done
priority: high
tags:
- backend
- security
- shield-proxy
dependencies:
- backend-008
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 6h
complexity: 7
area: backend
---

# Shield Proxy Integration - Transport Layer Encryption

## Causation Chain
> Shield proxy (v2.2.0) provides transparent network-layer encryption.
> ArkAChat currently encrypts at app layer only (Shield RatchetSession).
> Adding proxy provides defense-in-depth: app-layer + transport-layer encryption.
> Flow: Client → shield-proxy (encrypt) → SMP Server → shield-proxy (decrypt) → Recipient

## Pre-flight Checks
- [ ] Read `/data/git/Dikestra AI/Shield/shield-proxy/src/config.rs` for TOML config structure
- [ ] Read `/data/git/Dikestra AI/Shield/shield-proxy/deploy/shield-proxy.toml` for example config
- [ ] Read `/data/git/Dikestra AI/Shield/shield-proxy/deploy/docker-compose.yml` for HA setup
- [ ] Read `/data/git/Dikestra AI/Shield/shield-proxy/Dockerfile` for container build
- [ ] Verify Shield v2.2.0 proxy API in `/data/git/Dikestra AI/Shield/shield-proxy/src/proxy.rs`
- [ ] `git log --oneline -5` in Shield repo to confirm proxy is merged

## Context
Shield v2.2.0 adds `shield-proxy`, a transparent encryption proxy that can wrap
WebSocket (SimpleX) traffic with Shield encryption at the network layer. ArkAChat
currently relies solely on app-layer Shield encryption. Integrating shield-proxy adds
a second encryption layer at transport, making traffic analysis significantly harder.

The proxy supports:
- Protocol auto-detection (HTTP, TLS, WebSocket, raw TCP)
- Bidirectional Shield encryption with length-prefixed framing
- Hot redundancy (active/standby with heartbeat failover)
- Prometheus metrics for observability
- Docker deployment (distroless, ~50MB)

## Tasks
- [ ] Create `arkachat-proxy/` directory with deployment configs
- [ ] Write `shield-proxy.toml` config targeting SimpleX SMP servers as upstreams
- [ ] Configure Shield encryption params (password, service label, replay TTL)
- [ ] Create `Dockerfile` extending shield-proxy base image with ArkAChat config
- [ ] Create `docker-compose.yml` for HA proxy pair (active/standby)
- [ ] Add proxy DNS forwarding config for SMP server resolution
- [ ] Configure Prometheus metrics endpoint for monitoring
- [ ] Update Android `SimpleXClient.kt` to route through local proxy when available
- [ ] Update Web `client.ts` to route through proxy endpoint
- [ ] Add proxy health check integration to connection state management
- [ ] Build + test + verify proxy forwards WebSocket traffic correctly

## Acceptance Criteria
- [ ] shield-proxy container builds and starts with ArkAChat config
- [ ] WebSocket traffic to SMP servers routes through proxy transparently
- [ ] Shield encryption applied at transport layer (verified via packet capture)
- [ ] HA failover works: standby takes over when primary stops
- [ ] Prometheus metrics accessible at configured endpoint
- [ ] No dead code, no stubs, no warnings in proxy config
- [ ] Existing app-layer encryption still works (defense-in-depth)

## Notes
- Proxy is optional: clients should fall back to direct connection if proxy unavailable
- Use `shield_encrypt = true` for SMP server upstreams
- Proxy bind address should be configurable per environment
- Shield proxy source: `/data/git/Dikestra AI/Shield/shield-proxy/`

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
