---
id: auth-006
title: 'SEC: Erlang no authentication/authorization — shared guest identity, public ETS, any user reads all conversations'
status: todo
priority: medium
tags:
- auth
dependencies:
- backend-018
assignee: developer
created: 2026-08-25T21:16:34.491197243Z
estimate: 16h
complexity: 3
area: auth
---

# SEC: Erlang no authentication/authorization — shared guest identity, public ETS, any user reads all conversations

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
