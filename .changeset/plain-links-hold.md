---
'@atproto/bsky': patch
'@atproto/pds': patch
---

Count a `com.para.community.relation` only when its author owned the parent community when the AppView indexed it (or, for a horizontal parent, founded it), so no account can attach its community under another and inject content into its `includeChildren` listing. Relation duplicates and direct cycles are now per author, and a migration re-indexes the relation records an earlier writer's link had kept out. List a `com.para.community.briefingPack` only when its author was an owner or moderator of its community when indexed; the PDS `createBriefingPack` and `updateBriefingPack` routes check `briefing.manage` through the AppView. A `left` membership record now ends membership and offices for a member whose authority chain holds an activation, in both the snapshot and `isCommunityOwnerSql`.
