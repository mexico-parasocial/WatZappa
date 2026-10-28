export const tableName = 'para_community_admission'

export interface ParaCommunityAdmission {
  uri: string
  cid: string
  creator: string
  communityUri: string
  memberDid: string
  state: string
  decidedAt: string
  indexedAt: string
}

export type PartialDB = { [tableName]: ParaCommunityAdmission }
