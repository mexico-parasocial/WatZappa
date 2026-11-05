---
'@atproto/bsky': patch
---

OD-9 phase 3: every membership and office answer for a community account comes from its folded chain. A new `community-membership` module is the single seam; `getAuthoritySnapshots` dispatches on the community URI. Board lookups resolve accounts by URI, DID, handle or slug. Covered: `getAuthorization`, `getBoard`, `listMembers`, `getGovernance`, `getPolicyCommunityVotes`, delegation candidates, cabildeo vote eligibility and tallies, member counts, alignment, suggestions and the personal civic tree. Boards keep their legacy path until phase 5. Member post counts no longer count every post when a community has no name to match.
