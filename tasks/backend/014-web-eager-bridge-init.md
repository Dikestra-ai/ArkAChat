---
id: backend-014
title: "Web: Eager Bridge Initialization on App Startup"
status: done
priority: critical
tags:
- backend
- web
- simplex
dependencies:
- backend-008
assignee: developer
created: 2026-03-19T14:10:00Z
estimate: 3h
complexity: 4
area: backend
---

# Web: Eager Bridge Initialization on App Startup

## Causation Chain
> `ShieldSimplexBridge` is only initialized lazily when `useChatBridge()` hook runs
> (in `useChatBridge.ts` line 27-30). This hook is only called from chat components.
> If user is on landing page or contacts page, SimpleX connection is never established.
>
> Additionally, `chatStore.initialize()` (line 62-64) only sets `isInitialized: true`
> without connecting SimpleX — misleading.
>
> `layout.tsx` is a server component with no bridge provider.
>
> Flow that should exist:
> `layout.tsx` → `<BridgeProvider>` (client component) → `bridge.initialize()` on mount
> → SimpleX connected immediately → messages receivable on any page

## Pre-flight Checks
- [ ] Read `chatguard-web/src/hooks/useChatBridge.ts` — lazy init confirmed (line 27-30)
- [ ] Read `chatguard-web/src/lib/storage/chatStore.ts` — `initialize()` is a no-op
- [ ] Read `chatguard-web/src/app/layout.tsx` — server component, no bridge init
- [ ] Read `chatguard-web/src/lib/bridge/shieldSimplexBridge.ts` — `initialize()` method
- [ ] Read `chatguard-web/src/app/chat/page.tsx` — uses `useChatBridge()` (only page that does)

## Context
The web app's SimpleX connection is only established when a user navigates to a chat view
that renders a component using `useChatBridge()`. Messages sent to the user while they're
on other pages are missed. The bridge needs to initialize eagerly at app startup.

## Tasks
- [ ] Create `chatguard-web/src/components/BridgeProvider.tsx` — client component with `'use client'`
  - Calls `bridge.initialize()` on mount via `useEffect`
  - Subscribes to connection state changes
  - Provides bridge status context to children
- [ ] Update `chatguard-web/src/app/layout.tsx` to wrap children in `<BridgeProvider>`
- [ ] Remove lazy initialization from `useChatBridge.ts` — bridge is already initialized
  - Keep the hook for accessing bridge methods, but don't init in `useEffect`
- [ ] Fix `chatStore.initialize()` to either remove the misleading method or connect it to bridge
- [ ] Ensure bridge singleton is properly shared between `BridgeProvider` and `useChatBridge`
- [ ] Handle SSR: `BridgeProvider` must be client-only (no WASM on server)
- [ ] Build + test + verify SimpleX connects on app load regardless of route

## Acceptance Criteria
- [ ] SimpleX connection established when app loads (any page)
- [ ] Messages received on landing page, contacts page, chat page
- [ ] No duplicate bridge instances
- [ ] No SSR errors (WASM is client-only)
- [ ] No dead code, no stubs
- [ ] `npm run build` passes with no warnings
- [ ] Connection state visible in UI

## Notes
- The `bridgeInstance` module-level variable in `useChatBridge.ts` already acts as singleton
- `BridgeProvider` just needs to trigger initialization, not hold state
- Must use `'use client'` directive since WASM and WebSocket are browser-only APIs

---
**Session Handoff** (fill when done):
- Changed: [files/functions modified]
- Causality: [what triggers what]
- Verify: [how to test this works]
- Next: [context for dependent tasks]
