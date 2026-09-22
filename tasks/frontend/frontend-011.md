---
id: frontend-011
title: 'SEC: Apply desktop.patch — HIGH renderer CSP, delete no-op cert-pinning, fail-closed updater, sandbox:true'
status: done
priority: high
tags:
- frontend
dependencies:
- setup-001
assignee: developer
created: 2026-08-25T17:01:46.568544872Z
estimate: 2h
complexity: 4
area: frontend
---

# SEC: Apply desktop.patch — HIGH renderer CSP, delete no-op cert-pinning, fail-closed updater, sandbox:true

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