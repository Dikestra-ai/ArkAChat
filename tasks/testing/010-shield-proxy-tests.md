---
id: testing-010
title: "Shield Proxy Integration Tests"
status: done
priority: medium
tags:
- testing
- shield-proxy
dependencies:
- backend-012
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 3h
complexity: 5
area: testing
---

# Shield Proxy Integration Tests

## Causation Chain
> After shield-proxy integration (backend-012), verify that WebSocket traffic routes
> through the proxy correctly and Shield transport encryption is applied.

## Pre-flight Checks
- [ ] Read completed backend-012 task file
- [ ] Read Shield proxy test patterns in `/data/git/Dikestra AI/Shield/shield-proxy/`
- [ ] Check Docker availability for proxy container tests

## Context
Shield proxy adds transport-layer encryption to SimpleX WebSocket traffic. Tests must
verify the proxy forwards traffic correctly, applies Shield encryption, and handles
failover in HA configuration.

## Tasks
- [ ] Test proxy starts and accepts WebSocket connections
- [ ] Test proxy forwards to SMP server upstream
- [ ] Test Shield encryption is applied at transport layer
- [ ] Test HA failover: primary down → standby takes over
- [ ] Test health endpoint returns correct status
- [ ] Test Prometheus metrics are populated
- [ ] Test client fallback to direct connection when proxy unavailable
- [ ] Build + run tests

## Acceptance Criteria
- [ ] Proxy forwarding test passes
- [ ] HA failover test passes
- [ ] Health/metrics endpoints respond correctly
- [ ] Client fallback works when proxy is down
- [ ] No dead code in test files

## Notes
- Proxy tests require Docker for container-based testing
- Use docker-compose for HA pair testing

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
