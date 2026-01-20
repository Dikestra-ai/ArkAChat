---
id: frontend-003
title: "Media Viewer & Attachment Handling"
status: todo
priority: medium
tags: [ui, compose, android, media]
dependencies: [frontend-001, backend-001]
assignee: developer
created: 2026-01-20T17:30:00Z
estimate: 3h
complexity: 3
area: frontend
---

# Media Viewer & Attachment Handling

## Context
Implement media viewing, image/video attachments, and file sharing with Shield StreamCipher encryption.

## Objectives
- Create full-screen media viewer
- Implement image picker and camera capture
- Handle video playback
- Support file attachments

## Tasks
- [ ] Create `MediaViewer.kt` full-screen composable
- [ ] Implement pinch-to-zoom for images
- [ ] Add video player with controls
- [ ] Create `AttachmentPicker.kt` bottom sheet
- [ ] Implement camera capture flow
- [ ] Create `MediaThumbnail.kt` for chat bubbles
- [ ] Handle file download/save to device

## Technical Details

### Media Flow
```
1. User selects image/video
2. Compress if needed (images: WebP, videos: H.264)
3. Encrypt with StreamCipher
4. Upload to SimpleX file server
5. Send message with file URL + encryption key
6. Recipient downloads + decrypts
7. Cache decrypted media locally
```

### MediaViewer
```kotlin
@Composable
fun MediaViewer(
    mediaUri: Uri,
    mediaType: MediaType,
    onDismiss: () -> Unit,
    onShare: () -> Unit,
    onSave: () -> Unit
)
```

### Supported Formats
- Images: JPEG, PNG, WebP, GIF
- Videos: MP4, WebM
- Files: Any (shown as file attachment)

## Acceptance Criteria
- [ ] Images display correctly with zoom
- [ ] Videos play with controls
- [ ] Media encrypted before upload
- [ ] Download progress shown
- [ ] Save to gallery works
