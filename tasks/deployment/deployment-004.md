---
id: deployment-004
title: 'SEC: Apply proxy-infra.patch — CRIT PSK literal unexpanded, HIGH metrics/DNS exposure, CI signing'
status: done
priority: critical
tags:
- deployment
dependencies:
- setup-001
assignee: developer
created: 2026-08-25T17:01:02.484728218Z
estimate: 2h
complexity: 4
area: deployment
---

# SEC: Apply proxy-infra.patch — CRIT PSK literal unexpanded, HIGH metrics/DNS exposure, CI signing

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