export const tableName = 'para_community_authority_event'

export interface ParaCommunityAuthorityEvent {
  id: string
  uri: string
  cid: string
  creator: string
  communityUri: string
  subject: string
  action: string
  issuer: string
  effectiveAt: string
  expiresAt: string | null
  predecessor: string | null
  version: number
  basis: string
  evidence: string | null
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityAuthorityEvent
}
