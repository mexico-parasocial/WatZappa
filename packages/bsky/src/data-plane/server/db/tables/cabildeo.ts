import { GeneratedAlways } from 'kysely'

export const cabildeoTableName = 'cabildeo_cabildeo'
export const positionTableName = 'cabildeo_position'
export const delegationTableName = 'cabildeo_delegation'
export const voteTableName = 'cabildeo_vote'
export const liveSessionTableName = 'cabildeo_live_session'
export const livePresenceTableName = 'cabildeo_live_presence'

export interface CabildeoCabildeo {
  uri: string
  cid: string
  creator: string
  title: string
  description: string
  community: string
  communities: string[] | null
  flairs: string[] | null
  region: string | null
  geoRestricted: 0 | 1 | null
  options: unknown // JSON array of options
  minQuorum: number | null
  voteVisibility: string | null
  phase: string
  phaseDeadline: string | null
  createdAt: string
  positionCount: number
  positionForCount: number
  positionAgainstCount: number
  positionAmendmentCount: number
  voteCount: number
  directVoteCount: number
  delegatedVoteCount: number
  delegationCount: number
  optionVoteCounts: number[] | null
  optionPositionCounts: number[] | null
  winningOption: number | null
  isTie: 0 | 1
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export interface CabildeoPosition {
  uri: string
  cid: string
  creator: string
  cabildeo: string
  stance: string
  optionIndex: number | null
  text: string
  compassQuadrant: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export interface CabildeoDelegation {
  uri: string
  cid: string
  creator: string
  cabildeo: string | null
  delegateTo: string | null
  mode: string | null
  party: string | null
  community: string | null
  scopeFlairs: string[] | null
  preferredOption: number | null
  signal: number | null
  reason: string | null
  createdAt: string
  indexedAt: string
}

export interface CabildeoVote {
  uri: string
  cid: string
  creator: string
  cabildeo: string
  selectedOption: number | null
  isDirect: 0 | 1
  delegatedFrom: string[] | null
  voteNullifier: string | null
  eligibilityProofRef: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export interface CabildeoLiveSession {
  cabildeo: string
  hostDid: string
  liveUri: string
  startedAt: string
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CabildeoLivePresence {
  cabildeo: string
  actorDid: string
  sessionId: string
  joinedAt: string
  lastHeartbeatAt: string
  expiresAt: string
}

export type PartialDB = {
  [cabildeoTableName]: CabildeoCabildeo
  [positionTableName]: CabildeoPosition
  [delegationTableName]: CabildeoDelegation
  [voteTableName]: CabildeoVote
  [liveSessionTableName]: CabildeoLiveSession
  [livePresenceTableName]: CabildeoLivePresence
}
