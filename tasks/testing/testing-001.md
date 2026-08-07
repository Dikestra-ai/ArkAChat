---
id: testing-001
title: 'Nitrogen: EUnit + CT integration tests (shield_bridge, bots, pages)'
status: done
priority: high
tags:
- testing
dependencies:
- backend-002
- backend-003
- frontend-003
- frontend-004
- frontend-005
assignee: developer
created: 2026-08-07T20:31:10.962000026Z
estimate: 4h
complexity: 6
area: testing
---

# Nitrogen: EUnit + CT integration tests (shield_bridge, bots, pages)

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