export const tableName = 'para_community_relation'

export interface ParaCommunityRelation {
  uri: string
  cid: string
  creator: string
  rkey: string
  parentCommunityUri: string
  childCommunityUri: string
  relation: string
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityRelation
}
