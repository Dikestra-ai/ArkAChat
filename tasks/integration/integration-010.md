---
id: integration-010
title: 'grapheme-core RAG: replace OpenRouter embeddings with grapheme-core semantic graph similarity'
status: todo
priority: medium
tags:
- integration
dependencies:
- integration-008
assignee: developer
created: 2026-09-25T09:23:30.920040681Z
estimate: 6h
complexity: 6
area: integration
---

# grapheme-core RAG: replace OpenRouter embeddings with grapheme-core semantic graph similarity

## Causation Chain
> `arkachat-assistant/src/documents/rag.ts` calls OpenRouter's embedding API to convert
> query and doc chunks into float vectors, then computes cosine similarity (threshold 0.55).
> Replace with: text → DagNN graph (grapheme-core) → graph edit distance / node similarity → ranked docs.

## Pre-flight Checks
- [ ] Read `arkachat-assistant/src/documents/rag.ts` — `embed()` call site and similarity logic
- [ ] Check what doc chunks look like in the database (sqlite3 schema)
- [ ] Read integration-008 Session Handoff — GraphemeClient API
- [ ] `grep -r "embedding\|cosine\|similarity" arkachat-assistant/src/` — all usage sites

## Context
The RAG pipeline encodes documents as float vectors for similarity search. grapheme-core
replaces this with graph-based similarity: two texts are similar if their DagNN graphs share
many nodes and edges. This is purely local, offline, and language-neutral.

Graph similarity metric: `sim(A, B) = |nodes(A) ∩ nodes(B)| / |nodes(A) ∪ nodes(B)|`
(Jaccard on node content sets). Store precomputed graphs alongside doc chunks.

## Tasks
- [ ] Create `arkachat-assistant/src/grapheme/similarity.ts` — `GraphemeSimilarity` class
- [ ] `encodeChunk(text: string): Promise<GraphResult>` — encode a doc chunk via GraphemeClient
- [ ] `similarity(a: GraphResult, b: GraphResult): number` — Jaccard on node content sets, range [0,1]
- [ ] Precompute and cache doc graphs on first load; store as JSON in sqlite alongside chunks
- [ ] Replace `embed()` in `rag.ts` with `GraphemeSimilarity.encodeChunk()`
- [ ] Replace cosine similarity comparison with `GraphemeSimilarity.similarity()`
- [ ] Adjust threshold: start at 0.3 (graph Jaccard is stricter than cosine)
- [ ] Add fallback: if grapheme returns error, fall back to OpenRouter embeddings
- [ ] Test with a known doc + query that should match: verify top-1 returned correctly

## Acceptance Criteria
- [ ] `GraphemeSimilarity.similarity(encode("hello world"), encode("world hello"))` > 0.5
- [ ] RAG query returns correct top-K docs for test corpus without OpenRouter call
- [ ] Precomputed graphs persist across assistant restarts (cache check on startup)
- [ ] Fallback to OpenRouter when grapheme-bridge subprocess fails

## Notes
Graph Jaccard is symmetric and bounded [0,1]. It naturally handles Hebrew/English mixed text
since grapheme-core operates on characters, not tokens. Pre-encode doc corpus once, then
compute similarity at query time O(|docs| × |query_nodes|).

Precomputed graph cache: store in same sqlite DB as doc chunks.
Column: `grapheme_graph TEXT` (JSON-serialized GraphResult, nullable).

---
**Session Handoff** (fill when done):
- Changed: `arkachat-assistant/src/documents/rag.ts`, new `src/grapheme/similarity.ts`
- Causality: GraphemeClient → graph encoding → Jaccard similarity → ranked docs
- Verify: run RAG query end-to-end, check `source: 'grapheme'` in log
- Next: integration-011 (Gibraltar-Code relay across sessions)
