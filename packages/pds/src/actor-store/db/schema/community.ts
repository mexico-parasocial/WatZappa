// OD-9 community account state; see migration 006-community.
export interface CommunityState {
  id: 1
  lastSeq: number
  lastUri: string
  lastCid: string
  governanceMode: string
  admissionMode: string
}

export interface CommunityMember {
  did: string
  status: string
  /** JSON array of offices. */
  offices: string
  suspendedUntil: string | null
  since: number
}

export interface CommunityOffer {
  seq: number
  office: string
  subject: string
  issuer: string
  expiresAt: string
}

export interface CommunityUsedRequest {
  uri: string
  seq: number
}

export type PartialDB = {
  community_state: CommunityState
  community_member: CommunityMember
  community_offer: CommunityOffer
  community_used_request: CommunityUsedRequest
}
