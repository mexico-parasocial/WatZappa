export const tableName = 'para_community_role_acceptance'

export interface ParaCommunityRoleAcceptance {
  uri: string
  cid: string
  creator: string
  communityUri: string
  role: string
  subject: string
  offerUri: string
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityRoleAcceptance
}
