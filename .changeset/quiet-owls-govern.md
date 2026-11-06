---
'@atproto/common': patch
'@atproto/pds': patch
'@atproto/bsky': patch
---

OD-9 phase 4: community accounts take the remaining governance actions through `com.para.community.act`. Removal, blocking and unblocking, with a moderator's `sanction.propose`; owner transfer by `owner.offer`, `owner.accept` and `owner.resign`; `content.hide`, `restore`, `pin` and `unpin`; `relation.link`, `accept` and `unlink`; `briefing.publish` and `archive`. The policy gains a `CommunityEffect` for state outside membership, which the AppView stores and the host ignores. The AppView serves shared content, relations and briefing packs of a community account from its chain; a relation counts when both communities hold their half, and editing a published draft withdraws it. A member's request now binds `sanction`, `target` and `targetCid` too. Also `profile.update`, which replaces the profile record in the commit that appends the event; relations on a cycle of any length are set aside; `com.para.community.listOpenOffers` lists what a steward or an offered member may answer; and `listBoards` includes community accounts.
