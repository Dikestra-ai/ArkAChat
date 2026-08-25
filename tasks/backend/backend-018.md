---
id: backend-018
title: 'SEC: Apply erlang.patch — CRIT hardcoded distribution cookie RCE + HIGH key fail-closed/redaction'
status: todo
priority: critical
tags:
- backend
dependencies:
- setup-001
assignee: developer
created: 2026-08-25T17:01:08.703373127Z
estimate: 3h
complexity: 5
area: backend
---

# SEC: Apply erlang.patch — CRIT hardcoded distribution cookie RCE + HIGH key fail-closed/redaction

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
