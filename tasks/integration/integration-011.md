---
id: integration-011
title: 'Gibraltar-Code relay: CIPHER unicode-bridge ↔ grapheme-core ↔ ArkAChat state sync'
status: todo
priority: medium
tags:
- integration
dependencies:
- integration-008
- integration-006
assignee: developer
created: 2026-09-25T09:23:34.816077424Z
estimate: 3h
complexity: 4
area: integration
---

# Gibraltar-Code relay: CIPHER unicode-bridge ↔ grapheme-core ↔ ArkAChat state sync

## Causation Chain
> CIPHER/DLM (`unicode_bridge.rs`) has a SemanticBridge with 18-field ontology and 180+ lexicon entries.
> ArkAChat assistant uses the same ontology for intent routing (integration-009).
> Gibraltar-Code is the relay: DLM session publishes `semantic.lexicon.*` state; ArkAChat reads it.
> This enables live ontology updates without redeployment.

## Pre-flight Checks
- [ ] `gibraltar-code state list` in ArkAChat — see what's published
- [ ] `gibraltar-code state get "grapheme.integration.status"` — confirm CIPHER session state is visible
- [ ] Read `libs/dikestra-orchestrator/src/coordinator.ts` — how to read cross-project state
- [ ] Read `CIPHER/DLM/src/unicode_bridge.rs` `SemanticBridge::build_semantic_lexicon()` — field/word map

## Context
Two systems share the 18-field semantic ontology:
- CIPHER/DLM: SemanticBridge with en→hi translation lexicon
- ArkAChat: intent classifier domains

Gibraltar-Code provides the bridge: CIPHER session registers as `cipher-unicode-bridge` and
publishes lexicon entries as state. ArkAChat reads them to extend its intent vocabulary.

Sessions:
- CIPHER/DLM: `cipher-unicode-bridge` (registered in `/data/git/CIPHER/DLM/.gibraltar-code/`)
- ArkAChat: `arkachat`, `grapheme-integrator` (in `/data/git/Dikestra-ai/ArkAChat/.gibraltar-code/`)
- Other session: Claude Code session ID `c13cf5a1-7d8d-47c7-ae18-0af263e90d39`

## Tasks
- [ ] In CIPHER/DLM: add `publish_semantic_state()` fn to `web.rs` that runs at startup:
  publishes each SemanticField → representative words as Gibraltar-Code state keys
  e.g. `gibraltar-code state set "cipher.semantic.Commerce" '["money","buy","sell","trade"]'`
- [ ] In ArkAChat `libs/dikestra-orchestrator/src/coordinator.ts`: add `getSemanticField(field: string)`
  that reads `cipher.semantic.<field>` from Gibraltar-Code state
- [ ] Wire `getSemanticField` into intent classifier (integration-009) for vocabulary expansion
- [ ] Add `cipher.bridge.session` state key pointing to CIPHER session name
- [ ] Test: run DLM server → verify `gibraltar-code state get "cipher.semantic.Commerce"` returns words
- [ ] Test: ArkAChat reads `cipher.semantic.Commerce` and expands Commerce intent vocabulary

## Acceptance Criteria
- [ ] `gibraltar-code state get "cipher.semantic.Commerce"` returns JSON array of words from DLM lexicon
- [ ] ArkAChat orchestrator can read all 18 semantic fields from Gibraltar-Code state
- [ ] Live update: change CIPHER lexicon, restart DLM server, ArkAChat sees updated vocabulary
- [ ] `gibraltar-task validate` — no orphan tasks

## Notes
Gibraltar-Code is already initialized in both directories:
- ArkAChat: `/data/git/Dikestra-ai/ArkAChat/.gibraltar-code/`
- CIPHER/DLM: `/data/git/CIPHER/DLM/.gibraltar-code/` (initialized this session)

State keys cross-project: both use the same binary (`/data/git/Dikestra-ai/Gibraltar-Code/target/release/gibraltar-code`).
State is stored per-directory in `.gibraltar-code/state/`. For cross-project sharing,
use the `CODEGUARD_DIR` env var or symlink one `.gibraltar-code/` into the other.

Alternative: DLM exports a JSON file to a shared path and ArkAChat reads it directly.
This avoids the cross-directory problem at the cost of a file dependency.

---
**Session Handoff** (fill when done):
- Changed: `CIPHER/DLM/src/web.rs` (publish state), `libs/dikestra-orchestrator/src/coordinator.ts` (read state)
- Causality: DLM startup → state publish → ArkAChat reads → vocabulary expansion
- Verify: `gibraltar-code state get "cipher.semantic.Commerce"` returns non-empty
- Next: integration-009 intent classifier can now use expanded vocabulary
