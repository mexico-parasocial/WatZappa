---
'@atproto/bsky': minor
'@atproto/pds': patch
'@atproto/ozone': patch
'@atproto/api': patch
---

A moderator is appointed only with their consent. The owner publishes a new `com.para.community.roleOffer`, the member answers with the existing `com.para.community.roleAcceptance` (its `offer` now names that record), and the owner publishes the `moderator.grant` by `ownerAppointment` citing the acceptance as `evidence`. The AppView indexes an offer only from a current owner to an active member, and an acceptance only from the member the offer names; it accepts the grant only if the acceptance is indexed, belongs to the same community, member and owner, and has not grounded an earlier appointment, so a revoked moderator cannot be reinstated by replaying it. A `moderator.revoke` must now name the member's own `moderator.grant` in `evidence`: its URI, or the evidence it cited, which `getGovernance` lists for the holder. Migration `20261107T120000000Z-add-community-role-offers` adds `para_community_role_offer` and `para_community_role_acceptance` (unique per offer). `getGovernance` gains `roleOffers` (offers still waiting, each with the member's latest authority event to chain to) and `eventUri` / `eventVersion` on each `roleHolder`, so a client can build the next event without guessing its version and predecessor. Appointments already indexed are unchanged.
