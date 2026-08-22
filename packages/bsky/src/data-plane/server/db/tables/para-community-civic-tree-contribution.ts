export const tableName = 'para_community_civic_tree_contribution'

export interface ParaCommunityCivicTreeContribution {
  id: string
  communityUri: string
  authorDid: string
  title: string
  content: string | null
  sourceUri: string | null
  sourceUrl: string | null
  sourceType: string
  metadata: string | null
  status: string
  approvedCardId: string | null
  /** Denormalized from the vote table so listing a queue needs no aggregate. */
  approveCount: number
  rejectCount: number
  createdAt: string
  decidedAt: string | null
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityCivicTreeContribution
}
