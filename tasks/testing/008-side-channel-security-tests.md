---
id: testing-008
title: "Side-Channel and MITM Security Tests"
status: done
priority: high
tags:
- testing
- security
dependencies:
- backend-015
- backend-016
- backend-017
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 5h
complexity: 7
area: testing
---

# Side-Channel and MITM Security Tests

## Causation Chain
> After implementing cert pinning (backend-015), message padding (backend-016), and
> traffic obfuscation (backend-017), we need tests to verify these mitigations work
> and don't regress.

## Pre-flight Checks
- [ ] Read completed backend-015, backend-016, backend-017 task files for implementation details
- [ ] Read existing test files in `arkachat-web/src/__tests__/` for test patterns
- [ ] Read `arkachat-web/vitest.config.ts` for test configuration
- [ ] Check `tests/vectors/` for existing cross-platform test vectors

## Context
Security mitigations are only as good as their tests. These tests verify that:
1. Certificate pinning rejects invalid certs
2. Message padding produces correct bucket sizes cross-platform
3. Traffic obfuscation generates dummy messages and randomizes timing
4. No regressions in existing encryption compatibility

## Tasks
- [ ] **Padding tests** (cross-platform):
  - Test all bucket boundaries (128, 256, 512, 1024, 2048, 4096)
  - Test pad/unpad roundtrip preserves original plaintext
  - Test padding format matches between Android and Web
  - Add padding test vectors to `tests/vectors/`
- [ ] **Cert pinning tests** (Android):
  - Test that connection with correct pin succeeds
  - Test that connection with wrong pin throws `SSLPeerUnverifiedException`
  - Mock OkHttp interceptor for pin validation testing
- [ ] **Traffic obfuscation tests**:
  - Test dummy message generation and discard
  - Test ping interval randomization falls in expected range
  - Test typing indicator rate limiting
  - Test group key distribution always sends fixed count
- [ ] **Integration tests**:
  - Test full encrypt → pad → send → receive → unpad → decrypt roundtrip
  - Test cross-platform: Web-encrypted padded message decryptable on Android vectors
- [ ] Build + run all tests + verify no warnings

## Acceptance Criteria
- [ ] All padding roundtrip tests pass on both platforms
- [ ] Cross-platform padding vectors match
- [ ] Cert pinning rejection test passes on Android
- [ ] Dummy message discard test passes
- [ ] No dead code in test files
- [ ] All existing tests still pass (no regressions)

## Notes
- Use vitest for web tests, JUnit for Android tests
- Padding test vectors should be committed to `tests/vectors/padding/`
- Cert pin tests need mock TLS — use OkHttp MockWebServer

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
