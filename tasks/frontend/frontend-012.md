---
id: frontend-012
title: 'SEC: Web passphrase/WebAuthn-PRF unlock — move desktop key decrypt into main process, out of renderer reach'
status: todo
priority: medium
tags:
- frontend
dependencies:
- backend-020
- frontend-011
assignee: developer
created: 2026-08-25T17:02:25.761234510Z
estimate: 2d
complexity: 7
area: frontend
---

# SEC: Web passphrase/WebAuthn-PRF unlock — move desktop key decrypt into main process, out of renderer reach

## Causation Chain
> Trace the component lifecycle: props → state init → render →
effects → event handlers → state updates → re-render. Verify actual
data flow and side effect cleanup in components.

## Pre-flight Checks
- [ ] Read dependency task files for implementation context (Session Handoff)
- [ ] Check component prop types and defaults
- [ ] Verify effect cleanup functions exist
- [ ] Trace state update propagation through components
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
