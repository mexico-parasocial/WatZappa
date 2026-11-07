export const tableName = 'para_community_role_offer'

export interface ParaCommunityRoleOffer {
  uri: string
  cid: string
  creator: string
  communityUri: string
  role: string
  subject: string
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityRoleOffer
}
