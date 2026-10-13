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

import type {
  ConsentPrefsStore,
  ConstitutionProposalsStore,
  DeliberationStore,
  IdentityMatrixStore,
  InfraStore,
  MatrixEventsStore,
  ModerationStore,
  ParticipationStore,
  SortitionStore,
} from './stores/index.js'

export interface DeviceSession {
  id: string
  did: string
  mxid: string
  deviceId: string
  friendlyName: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  revokedAt: string | null
}

export interface BridgeEvent {
  seq: number
  type: string
  communityUri: string | null
  /** DIDs that may receive this event; null = community-wide audience */
  audienceDids: string[] | null
  payload: unknown
  createdAt: string
}

/**
 * A request for a Matrix direct message. It holds the requester's MXID, which
 * the requester consented to share with the recipient, only while pending:
 * accepting hands it to the recipient once and blanks it; declining,
 * cancelling or expiry delete the row.
 */
export interface DmRequest {
  id: string
  requesterDid: string
  requesterMxid: string
  recipientDid: string
  createdAt: string
  expiresAt: string
}

export type DmRequestStatus = 'pending' | 'accepted'

/**
 * What either party may see of a request: never the MXID. An accepted request
 * stays (MXID removed) until it expires, so the requester knows an invite is
 * coming and can recognise it by the id.
 */
export interface DmRequestSummary {
  id: string
  requesterDid: string
  recipientDid: string
  status: DmRequestStatus
  createdAt: string
  expiresAt: string
}
