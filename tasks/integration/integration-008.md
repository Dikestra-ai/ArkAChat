---
id: integration-008
title: 'grapheme-core: add Rust FFI + grapheme-core crate to arkachat-assistant NLP pipeline'
status: todo
priority: high
tags:
- integration
dependencies:
- integration-007
assignee: developer
created: 2026-09-25T09:23:26.553640053Z
estimate: 4h
complexity: 5
area: integration
---

# grapheme-core: add Rust FFI + grapheme-core crate to arkachat-assistant NLP pipeline

## Causation Chain
> grapheme-core (Rust, `/data/git/Dikestra-ai/grapheme-nn/grapheme-core`) provides
> character-level DAG-based NLP. arkachat-assistant (TypeScript/Node.js) calls OpenRouter
> for intent classification and embeddings. Bridge: compile grapheme-core to a native Node
> addon (napi-rs) or call it via a small Rust binary spawned as a subprocess.

## Pre-flight Checks
- [ ] Read `/data/git/Dikestra-ai/grapheme-nn/grapheme-core/src/lib.rs` — public API surface
- [ ] Read `arkachat-assistant/src/intent/classifier.ts` — current intent call site
- [ ] Read `arkachat-assistant/src/documents/rag.ts` — current embedding call site
- [ ] `cargo build` in grapheme-core — verify clean compile
- [ ] Check napi-rs support: `cat /data/git/Dikestra-ai/grapheme-nn/grapheme-core/Cargo.toml | grep napi`

## Context
grapheme-core is a character-level NLP engine using directed acyclic graphs (DagNN). It operates
without tokenizer vocabulary limits — native Unicode, any language including Hebrew/English mix.

Currently arkachat-assistant depends on OpenRouter (external API) for:
1. Intent classification (`src/intent/classifier.ts`) — LLM call with Hebrew prompt
2. Document embeddings (`src/documents/rag.ts`) — external embedding API

grapheme-core replaces both with deterministic, local, zero-latency graph computation.
This makes ArkAChat fully private and offline-capable for NLP.

## Tasks
- [ ] Create `arkachat-assistant/src/grapheme/` directory for the bridge layer
- [ ] Option A (subprocess): write `grapheme-bridge` Rust binary in grapheme-core that accepts JSON on stdin and outputs graph result on stdout; call via `child_process.spawn` from TS
- [ ] Option B (native addon): add napi-rs to grapheme-core and build `.node` addon
- [ ] Recommend Option A first (simpler, no build pipeline changes)
- [ ] Create `arkachat-assistant/src/grapheme/bridge.ts` — wraps spawn, JSON encode/decode, error handling
- [ ] Export `GraphemeClient` class with `encodeText(text: string): Promise<GraphResult>` method
- [ ] Add `@arkachat/grapheme-core` workspace dep or path dep to assistant `package.json`
- [ ] Build and run: `cargo build --release -p grapheme-core` + `npm run dev` in assistant
- [ ] Add smoke test: `GraphemeClient.encodeText("Hello") → graph with ≥1 node`

## Acceptance Criteria
- [ ] `GraphemeClient.encodeText("שלום")` returns valid GraphResult (nodes > 0)
- [ ] `GraphemeClient.encodeText("Hello world")` returns valid GraphResult
- [ ] No calls to OpenRouter in the bridge itself (pure local computation)
- [ ] `cargo build -p grapheme-core` passes with zero errors
- [ ] Assistant boots without errors: `npm run dev`

## Notes
grapheme-core location: `/data/git/Dikestra-ai/grapheme-nn/grapheme-core/`
Main types: `DagNN`, `NodeType`, `Edge` — see `src/dag.rs` (815 lines), `src/node.rs` (1247 lines)

The subprocess approach (Option A) avoids any Rust/Node ABI compatibility issues.
The bridge binary reads `{"text": "..."}` from stdin and writes `{"nodes": N, "edges": E, "ok": true}`.

---
**Session Handoff** (fill when done):
- Changed: `arkachat-assistant/src/grapheme/bridge.ts`, grapheme-core Cargo.toml (new bin)
- Causality: grapheme-bridge binary spawned → JSON IPC → GraphemeClient exposed to TS
- Verify: `node -e "require('./src/grapheme/bridge').GraphemeClient.encodeText('hello').then(console.log)"`
- Next: integration-009 (intent bridge), integration-010 (RAG embeddings)
