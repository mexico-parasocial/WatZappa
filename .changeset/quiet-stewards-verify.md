---
'@atproto/bsky': patch
'@atproto/pds': patch
---

Count a `com.para.community.sharedContentAction` only when its author was an owner or moderator of the shared item's community when the AppView indexed it, and only when it names that community. Until now any account could hide shared content in any community, and a far-future `createdAt` kept the forged action on top; ordering now caps `createdAt` at `indexedAt`. The PDS `removeSharedContent` and `restoreSharedContent` routes ask the AppView's `getAuthorization` instead of trusting the `roles` in the caller's own membership record. An active membership record now opens a member's authority chain, so an owner's appointment or transfer of a member who joined with `community.join` grants the role instead of leaving them with no membership.
