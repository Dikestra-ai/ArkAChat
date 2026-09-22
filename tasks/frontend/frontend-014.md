---
id: frontend-014
title: 'SEC: Android notification leaks plaintext message body, ignores KEY_SHOW_PREVIEW setting'
status: done
priority: medium
tags:
- frontend
dependencies:
- backend-019
assignee: developer
created: 2026-08-25T21:15:32.204564201Z
estimate: 2h
complexity: 3
area: frontend
---

# SEC: Android notification leaks plaintext message body, ignores KEY_SHOW_PREVIEW setting

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