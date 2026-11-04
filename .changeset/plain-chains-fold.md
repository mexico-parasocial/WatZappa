---
'@atproto/common': patch
'@atproto/pds': patch
'@atproto/bsky': patch
---

Add OD-9 community accounts. `com.para.community.create` makes a community its own `did:plc` account that nobody can sign in as. `com.para.community.act` is the only writer of its event chain: it decides each action with the shared `applyCommunityEvent` policy and appends it in one transaction. Each event carries proof of the member's own request, so a host cannot act for a member. The AppView folds each community's chain in `seq` order into `para_community_member_state`. The result is the same whatever order events arrive in, and on a rebuild. Forks, broken links and deleted events freeze the community. Phase 2 covers founding, join, leave, moderator offers and acceptance, revocation, resignation, and suspensions of up to 7 days.
