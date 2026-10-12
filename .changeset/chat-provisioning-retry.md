---
'@para/matrix-bridge': patch
---

Retry failed community provisioning from current PDS records beyond the general retry limit, recover matching partially created rooms, and permit ordinary members to send chat messages. Add a blocked-provisioning metric. Surface temporary push delivery failures for retry, reject retired Expo tokens, and handle unread badge updates without message alerts.
