---
id: data-004
title: 'SEC: Web IndexedDB version conflict — crypto.ts opens v2, bridge opens v1, causes key lookup failures'
status: todo
priority: low
tags:
- data
dependencies:
- backend-020
assignee: developer
created: 2026-08-25T21:18:06.930800597Z
estimate: 1h
complexity: 3
area: data
---

# SEC: Web IndexedDB version conflict — crypto.ts opens v2, bridge opens v1, causes key lookup failures

## Causation Chain
> Trace the data lifecycle: schema → migration → connection pool →
query execution → result mapping → cache invalidation. Check actual
transaction boundaries and rollback behavior in code.

## Pre-flight Checks
- [ ] Read dependency task files for implementation context (Session Handoff)
- [ ] `grep -r "SELECT\|INSERT\|query\|execute" src/` - Find queries
- [ ] Check actual transaction boundaries
- [ ] Verify migration files match schema expectations
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
