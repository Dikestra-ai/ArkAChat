---
id: backend-010
title: "Push Notifications (FCM/APNs)"
status: todo
priority: high
tags: [backend, notifications, fcm, apns, android, ios]
dependencies: [backend-008]
assignee: developer
created: 2026-01-20T21:30:00Z
estimate: 6h
complexity: 5
area: backend
---

# Push Notifications (FCM/APNs)

## Context
Currently ArkAChat only has local notifications that work while the app is running.
Need to implement remote push notifications via FCM (Android) and APNs (iOS/Web)
to notify users of new messages when the app is in background or closed.

## Objectives
- Implement Firebase Cloud Messaging for Android
- Add Web Push (Service Worker) for browser notifications
- Create notification relay server
- Encrypt notification payloads (no plaintext content)

## Tasks

### Android (FCM)
- [ ] Add Firebase SDK dependencies
- [ ] Create `ArkAChatFirebaseService.kt`
- [ ] Register FCM token on app start
- [ ] Send token to SimpleX server on contact pairing
- [ ] Handle incoming push messages
- [ ] Show encrypted notification preview
- [ ] Add notification channels (messages, groups, system)

### Web (Service Worker)
- [ ] Create `sw.js` service worker
- [ ] Implement Web Push subscription
- [ ] Handle push events in background
- [ ] Show browser notifications
- [ ] Handle notification clicks (open chat)

### Notification Server
- [ ] Design notification relay protocol
- [ ] Encrypted payload format
- [ ] Rate limiting
- [ ] Device token management

## Technical Details

### Android FCM Service

```kotlin
// ArkAChatFirebaseService.kt
class ArkAChatFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Register token with SimpleX server
        CoroutineScope(Dispatchers.IO).launch {
            ArkAChatApp.instance.registerPushToken(token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data

        // Notification contains only:
        // - contactId or groupId
        // - messageType (text, file, etc.)
        // - timestamp
        // Content is fetched and decrypted locally

        val contactId = data["contactId"]
        val groupId = data["groupId"]
        val messageType = data["type"]

        // Show notification with generic preview
        showNotification(
            title = getContactName(contactId) ?: getGroupName(groupId),
            body = getNotificationPreview(messageType),
            data = data
        )

        // Trigger message sync
        MessageSyncService.syncNow()
    }

    private fun getNotificationPreview(type: String): String {
        return when (type) {
            "text" -> "New message"
            "file" -> "Sent a file"
            "image" -> "Sent an image"
            else -> "New notification"
        }
    }
}
```

### Web Service Worker

```typescript
// public/sw.js
self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {};

    const options = {
        body: data.preview || 'New message',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        data: {
            contactId: data.contactId,
            groupId: data.groupId,
            url: data.groupId
                ? `/group/${data.groupId}`
                : `/chat/${data.contactId}`
        },
        actions: [
            { action: 'reply', title: 'Reply' },
            { action: 'mark-read', title: 'Mark as Read' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'ArkAChat', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'reply') {
        // Open chat with reply focus
    } else {
        // Open chat
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});
```

### Encrypted Notification Payload

```json
{
    "to": "FCM_TOKEN_HERE",
    "data": {
        "type": "message",
        "contactId": "abc123",
        "messageType": "text",
        "timestamp": 1705780000000,
        "encrypted": "base64_hint_only"
    },
    "android": {
        "priority": "high"
    },
    "webpush": {
        "urgency": "high"
    }
}
```

### Security Considerations
- NO plaintext message content in push payload
- Only metadata: contact/group ID, message type, timestamp
- Actual content fetched and decrypted on device
- Push token rotated periodically
- Token revoked on logout

## Files to Create

### Android
- `ArkAChatFirebaseService.kt`
- `PushTokenManager.kt`
- `NotificationHelper.kt`

### Web
- `public/sw.js`
- `lib/push/webPush.ts`
- `lib/push/subscription.ts`

## Acceptance Criteria
- [ ] Android receives push when app closed
- [ ] Web receives push in background tab
- [ ] Notification shows sender name (not content)
- [ ] Clicking notification opens correct chat
- [ ] Push works for group messages
- [ ] Token refresh handled correctly
- [ ] Logout revokes push token
