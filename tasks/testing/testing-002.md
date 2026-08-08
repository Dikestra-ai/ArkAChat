---
id: testing-002
title: 'Integration tests: Web (DOMGuard) + Android (Emulator)'
status: doing
priority: high
tags:
- testing
dependencies:
- backend-003
- backend-002
assignee: developer
created: 2026-08-08T05:41:27.596217721Z
estimate: 3h
complexity: 8
area: testing
---

# Integration tests: Web (DOMGuard) + Android (Emulator)

## Causation Chain
> Trace the test execution flow: fixture setup → precondition → action →
assertion → teardown. Check actual test isolation - are tests
independent or order-dependent?

## Pre-flight Checks
- [ ] Read dependency task files for implementation context (Session Handoff)
- [ ] Read test files to verify actual assertions
- [ ] Check test isolation (no shared mutable state)
- [ ] Verify fixture setup and teardown completeness
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