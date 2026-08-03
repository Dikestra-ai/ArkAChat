---
id: backend-015
title: "Certificate Pinning for SimpleX WebSocket Connections"
status: done
priority: critical
tags:
- backend
- security
- mitm
dependencies:
- backend-013
- backend-014
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 4h
complexity: 5
area: backend
---

# Certificate Pinning for SimpleX WebSocket Connections

## Causation Chain
> Both Android and Web SimpleX clients connect to SMP servers via `wss://` but rely
> solely on system CA trust stores. An attacker with a compromised/rogue CA cert can
> intercept traffic via mitmproxy. While Shield encryption protects message content,
> the SMP protocol metadata (queue IDs, message IDs, correlation IDs) is visible
> after TLS termination.
>
> Android: `SimpleXClient.kt` line 172-177 — plain `OkHttpClient.Builder()` with no
> `CertificatePinner`. Network security config (line 4-5) trusts all system CAs.
>
> Web: `client.ts` line 170 — `new WebSocket(wsUrl)` with no additional TLS validation.

## Pre-flight Checks
- [ ] Read `arkachat-android/.../SimpleXClient.kt` lines 172-177 — no cert pinning
- [ ] Read `arkachat-android/.../res/xml/network_security_config.xml` — system CAs only
- [ ] Read `arkachat-web/src/lib/simplex/client.ts` line 166-170 — no TLS hardening
- [ ] Obtain TLS certificate fingerprints for smp4/5/6.simplex.im
- [ ] Check if SimpleX servers rotate certs (determine pin rotation strategy)

## Context
Without certificate pinning, a man-in-the-middle attacker (e.g., using mitmproxy with a
trusted CA cert installed on the network) can terminate TLS, inspect SMP protocol metadata
(queue IDs, message sizes, timing), and forward traffic. This enables traffic analysis
attacks even though message content remains Shield-encrypted.

## Tasks
- [ ] **Android**: Add `CertificatePinner` to `OkHttpClient.Builder` in `SimpleXClient.kt`
  - Pin SHA-256 fingerprints for smp4.simplex.im, smp5.simplex.im, smp6.simplex.im
  - Include backup pins for cert rotation
  - Handle `SSLPeerUnverifiedException` gracefully (disconnect + alert user)
- [ ] **Android**: Update `network_security_config.xml` with pin-set for simplex.im domain
  - Add `<pin-set>` with SHA-256 digest and expiration
- [ ] **Web**: Implement SubtleCrypto-based certificate verification where possible
  - Note: Browser WebSocket API doesn't support custom TLS — document this limitation
  - For Electron desktop: use Node.js `tls` module with pinning
- [ ] **Desktop**: Add certificate pinning in Electron main process for WebSocket connections
- [ ] Add pin rotation mechanism: store pins in config, updateable via secure channel
- [ ] Build + test + verify pinning rejects invalid certs

## Acceptance Criteria
- [ ] Android: Connection to SMP servers with wrong cert is rejected
- [ ] Android: Connection with correct pinned cert succeeds
- [ ] Desktop: Electron WebSocket connections use pinned certs
- [ ] Web: Limitation documented (browser WebSocket API lacks cert access)
- [ ] Pin rotation mechanism exists for cert renewals
- [ ] No dead code, no stubs, no warnings

## Notes
- Browser WebSocket API does NOT expose TLS certificates — pinning is only possible
  in Android (OkHttp) and Desktop (Node.js). For web, shield-proxy (backend-012)
  provides the transport-layer protection instead.
- OkHttp CertificatePinner example:
  ```kotlin
  val pinner = CertificatePinner.Builder()
      .add("smp4.simplex.im", "sha256/AAAA...")
      .add("smp5.simplex.im", "sha256/BBBB...")
      .add("smp6.simplex.im", "sha256/CCCC...")
      .build()
  ```
- Get actual pins: `openssl s_client -connect smp4.simplex.im:5223 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
