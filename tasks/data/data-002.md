---
id: data-002
title: 'SEC: Android deleteAllKeys() is a no-op — account/panic wipe leaves all key material intact'
status: todo
priority: medium
tags:
- data
dependencies:
- backend-019
assignee: developer
created: 2026-08-25T21:16:08.597933474Z
estimate: 2h
complexity: 3
area: data
---

# SEC: Android deleteAllKeys() is a no-op — account/panic wipe leaves all key material intact

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
