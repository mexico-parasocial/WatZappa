import type { ColumnType } from 'kysely'

// OD-9 community accounts; see migration 20261105T120000000Z.
export interface ParaCommunityAccount {
  did: string
  lastSeq: ColumnType<number, number | undefined, number>
  lastCid: string | null
  governanceMode: string | null
  admissionMode: string | null
  /** Why the chain stopped verifying, if it did: the community is frozen. */
  broken: string | null
  name: string | null
  description: string | null
  quadrant: string | null
  region: string | null
  /** CID of the profile's banner blob. */
  banner: string | null
  profileCid: string | null
  createdAt: string | null
  indexedAt: string
}

export interface ParaCommunityChainEvent {
  uri: string
  cid: string
  community: string
  seq: number
  prev: string | null
  action: string
  actor: string
  subject: string
  offer: number | null
  expiresAt: string | null
  sanction: string | null
  target: string | null
  targetCid: string | null
  /** `profile.update`: the presentation set, as JSON. */
  profile: string | null
  governanceMode: string | null
  admissionMode: string | null
  requestUri: string
  requestCid: string
  requestProof: Uint8Array
  createdAt: string
  indexedAt: string
  /** `pending` until folded, then `applied` or `invalid`. */
  status: ColumnType<string, string | undefined, string>
  reason: string | null
  /** Set when the record was deleted or rewritten; kept across rebuilds. */
  tampered: ColumnType<string | null, string | null | undefined, string | null>
}

export interface ParaCommunityMemberState {
  community: string
  did: string
  status: string
  offices: ColumnType<string[], string, string>
  suspendedUntil: string | null
  since: number
  /** `createdAt` of the event that last made them a member. */
  joinedAt: ColumnType<string | null, string | null | undefined, string | null>
}

export interface ParaCommunityOpenOffer {
  community: string
  seq: number
  office: string
  subject: string
  issuer: string
  expiresAt: string
}

export interface ParaCommunityUsedRequest {
  requestUri: string
  community: string
  seq: number
}

/** Moderation state of a shared item, from `content.*` events (OD-9 §3.9). */
export interface ParaCommunityContentState {
  community: string
  target: string
  hidden: ColumnType<boolean, boolean | undefined, boolean>
  pinned: ColumnType<boolean, boolean | undefined, boolean>
  hiddenAt: string | null
  hiddenBy: string | null
  seq: number
  updatedAt: string
}

/** The briefing-pack version a `briefing.*` event last named. */
export interface ParaCommunityBriefingState {
  community: string
  target: string
  cid: string
  state: string
  seq: number
  actor: string
  updatedAt: string
}

/** One community's half of a relation; it counts when both halves exist. */
export interface ParaCommunityRelationHalf {
  community: string
  other: string
  half: string
  seq: number
  eventUri: string
  eventCid: string
  actor: string
  createdAt: string
}

export type PartialDB = {
  para_community_account: ParaCommunityAccount
  para_community_chain_event: ParaCommunityChainEvent
  para_community_member_state: ParaCommunityMemberState
  para_community_open_offer: ParaCommunityOpenOffer
  para_community_used_request: ParaCommunityUsedRequest
  para_community_content_state: ParaCommunityContentState
  para_community_briefing_state: ParaCommunityBriefingState
  para_community_relation_half: ParaCommunityRelationHalf
}
