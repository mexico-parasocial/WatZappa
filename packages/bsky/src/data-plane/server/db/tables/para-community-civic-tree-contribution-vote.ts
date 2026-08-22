export const tableName = 'para_community_civic_tree_contribution_vote'

export interface ParaCommunityCivicTreeContributionVote {
  contributionId: string
  voterDid: string
  vote: string
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityCivicTreeContributionVote
}
