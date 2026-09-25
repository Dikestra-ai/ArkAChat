# ArkAChat Fix DAG
*Generated 2026-09-22 — topological execution order for all 61 open tasks*

## Legend
`CRIT` = Critical · `HIGH` = High · `MED` = Medium · `LOW` = Low

---

## Layer 0 — No dependencies (execute first, in parallel)

| ID | Priority | Title | Area |
|----|----------|-------|------|
| setup-001 | HIGH | Project Setup and Dependencies | setup |
| backend-018 | CRIT | Apply erlang.patch — CRIT RCE cookie + key fail-closed | backend |
| backend-019 | CRIT | Apply android.patch — media KDF, group-auth, WebView hardening | backend |
| backend-020 | HIGH | Apply web.patch — CSP/headers, group auth, AES-GCM, relay allowlist | backend |
| deployment-004 | CRIT | Apply proxy-infra.patch — PSK unexpanded, metrics/DNS exposure | deployment |
| frontend-011 | HIGH | Apply desktop.patch — renderer CSP, cert-pinning, fail-closed updater | frontend |

---

## Layer 1 — Unblock after Layer 0 (setup-001 unlocks most)

| ID | Priority | Title | Depends On |
|----|----------|-------|------------|
| backend-001 | HIGH | Shield Crypto Integration Layer | setup-002✅ |
| backend-002 | HIGH | SimpleX Protocol Client | setup-002✅ |
| backend-003 | HIGH | Local Storage with Room Database | setup-002✅ |
| backend-021 | CRIT | Wire up dead Android native stack | backend-019 |
| backend-022 | HIGH | TLS for Erlang HTTP server | backend-018 |
| backend-023 | MED | Android SMP frame parser crash (OOB/DoS) | backend-019 |
| backend-025 | MED | Android sensitive data in logcat | backend-019 |
| backend-027 | MED | Android ratchet desyncs on lost message | backend-019 |
| backend-028 | MED | Android unvalidated metadataLength DoS | backend-019 |
| backend-032 | MED | Web ratchet persistence lossy | backend-020 |
| backend-033 | MED | Web SMP inbound misrouting | backend-020 |
| backend-034 | MED | Web media key mismatch | backend-020 |
| backend-035 | MED | Web local relay cleartext ws:// | backend-020 |
| auth-003 | HIGH | Full group authorization model | backend-019, backend-020 |
| auth-004 | MED | Android biometric CryptoObject binding | backend-019 |
| data-001 | HIGH | SQLCipher migration (Android Room DB) | backend-019 |
| data-002 | MED | Android deleteAllKeys() no-op | backend-019 |
| data-004 | LOW | Web IndexedDB version conflict | backend-020 |
| deployment-004 deps: | | | |
| deployment-007 | MED | Proxy DNS leaks to plaintext port-53 | deployment-004 |
| deployment-008 | HIGH | Proxy redundancy broken / crash-loop | deployment-004 |
| deployment-009 | HIGH | Unsigned APK sideloading | deployment-004 |
| deployment-010 | MED | Proxy Docker runs as root | deployment-004 |
| deployment-011 | MED | Proxy docker-compose no resource limits | deployment-004 |
| deployment-012 | MED | Proxy replay_ttl_secs=60 too wide | deployment-004 |
| deployment-013 | MED | GH Actions mutable tag supply-chain | deployment-004 |
| frontend-011 deps: | | | |
| frontend-016 | MED | Electron no navigation lockdown | frontend-011 |
| frontend-017 | MED | Electron IPC no key-id validation | frontend-011 |
| frontend-018 | LOW | Electron silent in-memory keychain fallback | frontend-011 |
| frontend-013 | MED | Android FLAG_SECURE missing (🔄 in progress) | backend-019 |
| frontend-014 | MED | Android notification leaks plaintext body | backend-019 |
| frontend-015 | MED | Android QR no fingerprint confirmation | backend-019 |
| frontend-020 | MED | Web QR no fingerprint confirmation (🔄 in progress) | backend-020 |
| frontend-021 | MED | Web group system-message spoofing | backend-020 |
| backend-010 | HIGH | Push Notifications (FCM/APNs) | backend-008✅ |
| auth-002 | MED | Multi-Device Sync and Pairing | backend-008✅ |

---

## Layer 2 — Unblock after Layer 1

| ID | Priority | Title | Depends On |
|----|----------|-------|------------|
| backend-006 | CRIT | Android Shield + SimpleX Full Integration | backend-004✅, backend-005✅ |
| frontend-001 | HIGH | Chat Screen UI (Jetpack Compose) | backend-001, backend-003 |
| frontend-002 | HIGH | Contacts & Conversations List UI | backend-003 |
| frontend-004 | MED | Settings Screen | backend-003 |
| testing-001 | MED | Android Unit & Integration Tests | backend-001, backend-002, backend-003 |
| backend-024 | MED | Android TrafficObfuscator never started | backend-021 |
| auth-005 | MED | Android key material under software MasterKey | auth-004 |
| api-001 | MED | Web Shield WASM Integration | setup-003✅ |
| api-002 | MED | Web SimpleX WebSocket Client | setup-003✅ |
| backend-026 | LOW | Android LOW — JSON injection in SMPInvitation | backend-019 |
| backend-036 | LOW | Web unvalidated SMP server host from QR | backend-020 |
| data-003 | LOW | Android LOW crypto (cache, isInitiator, MasterKey) | backend-019 |
| frontend-012 | MED | Web WebAuthn-PRF unlock out of renderer | backend-020, frontend-011 |
| deployment-005 | MED | Electron upgrade 28→current + Fuses | frontend-011 |

---

## Layer 3 — Unblock after Layer 2

| ID | Priority | Title | Depends On |
|----|----------|-------|------------|
| frontend-003 | MED | Media Viewer & Attachment Handling | frontend-001, backend-001 |
| frontend-005 | MED | Web Chat UI (React) | api-001, api-002 |
| auth-001 | MED | Device Pairing & Cross-Platform Sync | backend-001, api-001 |
| testing-002 | HIGH | Cross-Platform Integration Tests (Android↔Web) | backend-006, api-003✅ |
| setup-004 | LOW | Desktop App (Electron Wrapper) | setup-003✅, frontend-005 |
| integration-003 | CRIT | Web: QR pairing e2e test web↔Android | integration-002🔄 |
| testing-006 | HIGH | Cross-Platform Integration Tests | testing-003✅, testing-004✅, testing-005✅ |

---

## Execution Wave Plan

```
Wave A (parallel, no deps):
  setup-001 · backend-018 · backend-019 · backend-020 · deployment-004 · frontend-011

Wave B (parallel, after Wave A):
  Android SEC: backend-021 · backend-022 · backend-023 · backend-025 · backend-027 · backend-028
  Android SEC: frontend-013 · frontend-014 · frontend-015 · auth-004 · data-001 · data-002
  Web SEC:     backend-032 · backend-033 · backend-034 · backend-035 · frontend-020 · frontend-021 · data-004
  Desktop SEC: frontend-016 · frontend-017 · frontend-018
  Proxy SEC:   deployment-007-013 · auth-003 · backend-022

Wave C (parallel, after Wave B):
  Features:    backend-001 · backend-002 · backend-003 · backend-006
  Desktop:     deployment-005
  Biometrics:  auth-005

Wave D (parallel, after Wave C):
  UI:    frontend-001 · frontend-002 · frontend-004 · frontend-005
  Tests: testing-001 · testing-002
  API:   api-001 · api-002 · backend-024 · backend-010 · auth-002

Wave E (parallel, after Wave D):
  frontend-003 · frontend-012 · auth-001 · integration-003
  testing-006 · setup-004
```

---

## Files to Touch Per Wave

### Wave A — SEC root patches
| Task | File(s) |
|------|---------|
| backend-018 | `arkachat-nitrogen/app/src/` (erlang cookie, key redaction) |
| backend-019 | `arkachat-android/app/src/main/java/ai/dikestra/arkachat/` |
| backend-020 | `arkachat-web/src/lib/` (shield/crypto.ts, simplex/client.ts, next.config.ts) |
| deployment-004 | `arkachat-proxy/shield-proxy.toml.template`, `docker-compose.yml`, `.github/workflows/release.yml` |
| frontend-011 | `arkachat-desktop/main/index.js`, `package.json` |
| setup-001 | `arkachat-android/app/build.gradle` dependencies audit |

### Wave B — SEC hardening (all derived from patches applied in Wave A)
*See task files for specific line references*

### Wave C–E — Feature implementation
*Requires Wave A–B complete so crypto/storage primitives are hardened before UI builds on them*
