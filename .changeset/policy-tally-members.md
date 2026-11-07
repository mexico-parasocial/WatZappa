---
'@atproto/bsky': patch
---

Count only community members in a policy tally (OD-10 §7.7). `getPolicyTally` used to sum every indexed ballot on a policy while computing its quorum over members, so an outsider's ballot counted towards a quorum it was not part of. It now keeps only ballots whose casting identity is an active member of the policy's community when the tally is read, by the same `filterActiveMembers` rule as a cabildeo tally, so a member who leaves stops counting and counts again on rejoining. Its eligible-voter count, and `getPolicyCommunityVotes`'s member count and votes, are judged by that rule too instead of by the `membershipState` each member writes in their own record. A policy with no resolvable community board keeps counting every ballot. Its quorum is now the cabildeo's `assemblyQuorumTarget`, capped at the electorate, so a community with fewer than ten members can reach it; a policy with no board keeps the floor of ten.
