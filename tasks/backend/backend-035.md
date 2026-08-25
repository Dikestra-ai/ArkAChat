---
id: backend-035
title: 'SEC: Web local relay preferred over wss:// — cleartext ws:// path used in production, exposes metadata'
status: todo
priority: medium
tags:
- backend
dependencies:
- backend-020
assignee: developer
created: 2026-08-25T21:17:58.941676923Z
estimate: 2h
complexity: 3
area: backend
---

# SEC: Web local relay preferred over wss:// — cleartext ws:// path used in production, exposes metadata

## Causation Chain
> Trace the service orchestration: entry point → dependency injection →
business logic → side effects → return. Verify actual error propagation
paths in the codebase.

## Pre-flight Checks
- [ ] Read dependency task files for implementation context (Session Handoff)
- [ ] `grep -r "impl.*Service\|fn.*service" src/` - Find service definitions
- [ ] Check actual dependency injection patterns
- [ ] Verify error propagation through service layers
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
