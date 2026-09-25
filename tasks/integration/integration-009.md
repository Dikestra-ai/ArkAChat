---
id: integration-009
title: 'grapheme-core intent bridge: replace OpenRouter intent classification with DagNN graph routing'
status: todo
priority: high
tags:
- integration
dependencies:
- integration-008
assignee: developer
created: 2026-09-25T09:23:30.912600622Z
estimate: 6h
complexity: 6
area: integration
---

# grapheme-core intent bridge: replace OpenRouter intent classification with DagNN graph routing

## Causation Chain
> `arkachat-assistant/src/intent/classifier.ts` calls OpenRouter LLM to extract
> `{ domain, action, w_type, subject, params, confidence }` from user text.
> Replace with: text → DagNN graph (grapheme-core) → field heuristic → structured output.
> Fallback: if grapheme confidence < 0.6, fall back to LLM.

## Pre-flight Checks
- [ ] Read `arkachat-assistant/src/intent/classifier.ts` — current interface and call signature
- [ ] Read `arkachat-assistant/src/nanoclaw/orchestrator.ts` — how intent is consumed
- [ ] Read integration-008 Session Handoff — GraphemeClient API available
- [ ] `grep -r "classify\|IntentResult" arkachat-assistant/src/` — find all call sites

## Context
The current intent classifier sends user messages (Hebrew/English) to OpenRouter. This is:
- Slow (network round-trip)
- Non-deterministic (LLM variance)
- Costly (API tokens)
- Private-data exposure risk

grapheme-core's DAG computation is local, deterministic, zero-cost, and Unicode-native.

## Tasks
- [ ] Document current `IntentResult` type shape from `classifier.ts`
- [ ] Create `arkachat-assistant/src/grapheme/intent.ts` with `GraphemeIntentClassifier` class
- [ ] Implement `classify(text: string): Promise<IntentResult>` via GraphemeClient subprocess
- [ ] Map DagNN graph output to intent domains using node/edge structure heuristics
- [ ] Use the 18 SemanticField ontology from CIPHER/DLM unicode_bridge (same naming):
  `Communication, Schedule, Query, Commerce, Social, Security, ...`
- [ ] Set `confidence = nodeCount / (nodeCount + edgeCount)` as initial heuristic
- [ ] If `confidence < 0.6` → fall back to existing OpenRouter path
- [ ] Add `source: 'grapheme' | 'llm'` to IntentResult for logging
- [ ] Test: "שלום, אני רוצה לתאם פגישה מחר" → domain: schedule, source: grapheme
- [ ] Test: "how much does the service cost?" → domain: commerce, source: grapheme

## Acceptance Criteria
- [ ] `GraphemeIntentClassifier.classify("schedule a meeting")` returns without LLM call
- [ ] `GraphemeIntentClassifier.classify("??xq#$")` falls back to LLM gracefully
- [ ] Existing orchestrator routing (script/RAG/draft) still works end-to-end
- [ ] Logs show `source: 'grapheme'` for high-confidence intents

## Notes
The 18 SemanticField ontology in CIPHER/DLM (`unicode_bridge.rs`) maps to ArkAChat intent domains.
Reuse the same field names for consistency across both systems:
`Communication, Motion, Perception, Physical, Creation, Cognition, Emotion, Social,
Existence, Spatial, Quantity, Time, Authority, Conflict, Nature, Commerce, Causality, Security`

---
**Session Handoff** (fill when done):
- Changed: `arkachat-assistant/src/intent/classifier.ts`, new `src/grapheme/intent.ts`
- Causality: GraphemeClient → DagNN graph → field heuristic → IntentResult
- Verify: `npm run dev` + send test message, check logs for `source: 'grapheme'`
- Next: integration-010 (RAG) is independent; can proceed in parallel
