export const tableName = 'para_community_civic_tree_relationship'

export interface ParaCommunityCivicTreeRelationship {
  id: string
  communityUri: string
  authorDid: string
  sourceCardId: string
  targetCardId: string
  relationshipType: string
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityCivicTreeRelationship
}
