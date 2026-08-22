export interface CommunitySpaceMap {
  communityUri: string
  spaceId: string
  slug: string
  chamberMode: string
  chamberA_RoomId: string | null
  chamberB_RoomId: string | null
  observerRoomId: string | null
  createdAt: string
}

export interface UserMatrixMap {
  did: string
  matrixUserId: string
  password: string
}

export interface UserPushToken {
  did: string
  expoPushToken: string
  platform: string
  updatedAt: string
}

export interface SyncLogEntry {
  id: number
  eventType: string
  communityUri: string
  did: string | null
  spaceId: string | null
  success: number
  retryCount: number
  error: string | null
  createdAt: string
}

export interface AiConsentRecord {
  did: string
  granted: boolean
  policyVersion: number
  grantedAt: string | null
  revokedAt: string | null
}


export type CommunityRoomKind = 'main' | 'chamber-a' | 'chamber-b' | 'observers'

export interface CommunityRoomSummary {
  roomId: string
  communityUri: string
  slug: string
  kind: CommunityRoomKind
}


import type { IdentityMatrixStore, InfraStore, ConstitutionProposalsStore, SortitionStore, ModerationStore, ParticipationStore, ConsentPrefsStore, MatrixEventsStore, DeliberationStore } from './stores/index.js'
