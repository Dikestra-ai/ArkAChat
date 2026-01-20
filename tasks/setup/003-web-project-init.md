---
id: setup-003
title: "Initialize Web App (Next.js)"
status: done
priority: medium
tags: [web, nextjs, setup]
dependencies: []
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 2h
complexity: 2
area: setup
---

# Initialize Web App (Next.js)

## Context
Set up the web application using Next.js 14 with App Router, React, and Shield WASM integration.

## Objectives
- Create Next.js project with TypeScript
- Configure Shield WASM (@guard8/shield-browser)
- Set up Tailwind CSS and shadcn/ui
- Configure IndexedDB for local storage

## Tasks
- [ ] Initialize Next.js project in `chatguard-web/`
- [ ] Install and configure Tailwind CSS
- [ ] Set up shadcn/ui component library
- [ ] Install @guard8/shield-browser WASM package
- [ ] Configure WASM loading in Next.js
- [ ] Set up IndexedDB wrapper (idb library)
- [ ] Create base layout and routing

## Technical Details

### Directory Structure
```
chatguard-web/
├── src/
│   ├── app/
│   │   ├── page.tsx           # Landing
│   │   ├── chat/page.tsx      # Chat interface
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/               # shadcn components
│   │   ├── ChatWindow.tsx
│   │   └── ContactList.tsx
│   ├── lib/
│   │   ├── shield/           # WASM crypto
│   │   ├── simplex/          # WebSocket client
│   │   └── storage/          # IndexedDB
│   └── styles/
├── package.json
└── tsconfig.json
```

### Key Dependencies
```json
{
  "@guard8/shield-browser": "^1.1.0",
  "next": "^14.0.0",
  "react": "^18.2.0",
  "tailwindcss": "^3.4.0",
  "idb": "^7.1.0",
  "lucide-react": "^0.300.0"
}
```

### WASM Configuration
```typescript
// next.config.js
module.exports = {
  webpack: (config) => {
    config.experiments = { asyncWebAssembly: true };
    return config;
  }
};
```

## Acceptance Criteria
- [ ] Next.js dev server starts
- [ ] Shield WASM loads correctly
- [ ] Tailwind styles working
- [ ] Basic routing works
