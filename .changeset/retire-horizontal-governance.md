---
'@atproto/common': minor
'@atproto/pds': patch
'@atproto/bsky': patch
'@atproto/ozone': patch
'@atproto/api': patch
---

Retire the horizontal community governance model and the `governanceMode` / `organizationStandard` fields with it: every community is hierarchical (owner and moderator roles). The fields leave `com.para.community.board`, `createBoard`, `getBoard`, `getGovernance` and `governanceConfig`, and `com.para.community.governanceConfig#roleRotationRules` (and its use in `com.para.community.governance`) is gone. `createBoard` always founds a community with a non-expiring `owner.grant`; the PDS no longer gates governance records on facilitator terms, and the AppView no longer accepts a 90-day `moderator.grant` as a founding transition. The `governance_mode` and `organization_standard` proto fields are reserved. The AppView migration `20261107T130000000Z-drop-board-governance-mode` rebuilds the authority of communities that had chosen `horizontal` (they are left without an owner) and drops `para_community_board.governanceMode`. The community civic tree no longer reads that column: its `moderator_gate` branch, which could never match the board's value, is removed. `@atproto/common` drops `HORIZONTAL_MODERATOR_TERM_DAYS` and `OrganizationStandard`, and `getRoleDefinitions` / `resolveAvailableAction` no longer take a standard.
