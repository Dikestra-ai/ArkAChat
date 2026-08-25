---
id: deployment-009
title: 'SEC: Unsigned APK sideloading via nightly.link — debug APK distributed with no signing or provenance'
status: todo
priority: high
tags:
- deployment
dependencies:
- deployment-004
assignee: developer
created: 2026-08-25T21:17:10.572397074Z
estimate: 6h
complexity: 3
area: deployment
---

# SEC: Unsigned APK sideloading via nightly.link — debug APK distributed with no signing or provenance

## Causation Chain
> Trace the deployment pipeline: source → build → artifact →
environment config → runtime injection → health check. Verify actual
env var usage and fallback defaults in config files.

## Pre-flight Checks
- [ ] Read dependency task files for implementation context (Session Handoff)
- [ ] `grep -r "env\|getenv\|std::env" src/` - Find env var usage
- [ ] Check actual config file loading order
- [ ] Verify health check endpoints exist
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
