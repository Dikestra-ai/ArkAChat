---
id: backend-022
title: 'SEC: TLS for Erlang HTTP server — serve nitrogen UI over HTTPS not plaintext 0.0.0.0:8000'
status: todo
priority: high
tags:
- backend
dependencies:
- backend-018
assignee: developer
created: 2026-08-25T17:02:17.619392108Z
estimate: 4h
complexity: 5
area: backend
---

# SEC: TLS for Erlang HTTP server — serve nitrogen UI over HTTPS not plaintext 0.0.0.0:8000

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
