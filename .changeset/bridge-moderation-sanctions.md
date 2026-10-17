---
'@para/matrix-bridge': patch
---

Make chat moderation hold: sanctions are recorded per DID and enforced at the projection (a mute survives reconciliation, a ban follows the member to any chat key), time-limited ones are lifted when they run out, moderators can lift a sanction or dismiss reports, enforcement results are reported honestly, risk badges are no longer sent to ordinary members, reports count distinct reporters, and `getSpaceForCommunity` returns camelCase on Postgres.
