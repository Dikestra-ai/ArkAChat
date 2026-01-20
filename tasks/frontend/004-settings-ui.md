---
id: frontend-004
title: "Settings Screen"
status: todo
priority: medium
tags: [ui, compose, android, settings]
dependencies: [backend-003]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 2h
complexity: 2
area: frontend
---

# Settings Screen

## Context
Implement settings screen for app configuration, security options, and account management.

## Objectives
- Create settings UI with grouped options
- Implement security settings (biometric, notifications)
- Add theme selection (light/dark/system)
- Show device linking options

## Tasks
- [ ] Create `SettingsScreen.kt` main composable
- [ ] Implement `SettingsSection.kt` grouping component
- [ ] Add biometric lock toggle
- [ ] Add notification settings
- [ ] Implement theme selector
- [ ] Create device linking section
- [ ] Add "About" section with version info
- [ ] Implement data export/backup

## Technical Details

### Settings Categories
```
Security
├── Biometric Lock (toggle)
├── Lock Timeout (dropdown)
└── Show Message Preview (toggle)

Notifications
├── Enable Notifications (toggle)
├── Sound (toggle)
└── Vibrate (toggle)

Appearance
├── Theme (Light/Dark/System)
└── Chat Bubble Style

Devices
├── Linked Devices (list)
└── Link New Device (button)

Data
├── Export Messages
├── Clear Cache
└── Delete Account

About
├── Version
├── Privacy Policy
└── Open Source Licenses
```

## Acceptance Criteria
- [ ] All settings persist across restarts
- [ ] Biometric lock activates correctly
- [ ] Theme changes apply immediately
- [ ] Device linking shows QR code
