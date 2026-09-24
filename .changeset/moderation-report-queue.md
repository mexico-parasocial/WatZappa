---
"@para/matrix-bridge": patch
---

Add `GET /api/moderation-reports`, the report queue for a community's moderators and owners: reports grouped per reported message (or per member for reports with no event), with counts, reason tallies and first/last times. It returns how many distinct people reported, never who, and no message text. The moderation dashboard no longer returns `recentEvents`, whose raw rows exposed each reporter's DID to every moderator.
