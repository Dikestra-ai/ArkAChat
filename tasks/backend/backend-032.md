---
id: backend-032
title: 'SEC: Web ratchet persistence lossy — receive counter reset on reload, send-counter replay risk on crash'
status: done
priority: medium
tags:
- backend
dependencies:
- backend-020
assignee: developer
created: 2026-08-25T21:17:45.687500943Z
estimate: 8h
complexity: 3
area: backend
---

# SEC: Web ratchet persistence lossy — receive counter reset on reload, send-counter replay risk on crash

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