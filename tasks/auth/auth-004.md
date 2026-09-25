---
id: auth-004
title: 'SEC: Android biometric CryptoObject binding — bind BiometricPrompt to actual key op, not decorative'
status: done
priority: medium
tags:
- auth
dependencies:
- backend-019
assignee: developer
created: 2026-08-25T17:02:19.064432512Z
estimate: 1d
complexity: 5
area: auth
---

# SEC: Android biometric CryptoObject binding — bind BiometricPrompt to actual key op, not decorative

## Causation Chain
> Trace the authentication flow: credential input → validation → token
generation → storage → verification → session state. Check actual
token expiry logic and refresh mechanism in implementation.

## Pre-flight Checks
- [ ] Read dependency task files for implementation context (Session Handoff)
- [ ] `grep -r "verify\|validate\|decode" src/` - Find token validation
- [ ] Check actual token expiry configuration
- [ ] Verify session state management implementation
- [ ] `git log --oneline -10` - Check recent related commits

## Context
[Why this task exists and what problem it solves]

## Tasks
- [ ] [Specific actionable task]
- [ ] [Another task]
- [ ] Build + test + run to verify

## Acceptance Criteria
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

## Notes
[Technical details, constraints, gotchas]

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]