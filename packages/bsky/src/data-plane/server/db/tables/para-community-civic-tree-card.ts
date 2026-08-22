export const tableName = 'para_community_civic_tree_card'

export interface ParaCommunityCivicTreeCard {
  id: string
  communityUri: string
  authorDid: string
  cardType: string
  title: string
  content: string | null
  sourceUri: string | null
  sourceUrl: string | null
  metadata: string | null
  stance: string | null
  compassQuadrant: string | null
  influence: number
  voteCount: number
  /** The contribution this card was promoted from, when it came through review. */
  contributionId: string | null
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityCivicTreeCard
}
