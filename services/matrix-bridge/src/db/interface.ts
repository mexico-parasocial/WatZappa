/**
 * Canonical database surface for the bridge, composed from per-domain stores
 * in ./stores/. Record types live in ./records.js. Every consumer type-imports
 * IBridgeDatabase from here; implementations (sqlite, postgres) and the async
 * sqlite wrapper all satisfy it.
 */

import type {
  IdentityMatrixStore,
  InfraStore,
  ConstitutionProposalsStore,
  SortitionStore,
  ModerationStore,
  ParticipationStore,
  ConsentPrefsStore,
  MatrixEventsStore,
  DeliberationStore,
} from './stores/index.js'

export interface IBridgeDatabase
  extends IdentityMatrixStore,
    InfraStore,
    ConstitutionProposalsStore,
    SortitionStore,
    ModerationStore,
    ParticipationStore,
    ConsentPrefsStore,
    MatrixEventsStore,
    DeliberationStore {
  close(): Promise<void>
}

export type {
  IdentityMatrixStore,
  InfraStore,
  ConstitutionProposalsStore,
  SortitionStore,
  ModerationStore,
  ParticipationStore,
  ConsentPrefsStore,
  MatrixEventsStore,
  DeliberationStore,
} from './stores/index.js'
export type {
  AiConsentRecord,
  CommunitySpaceMap,
  CommunityRoomKind,
  CommunityRoomSummary,
  SyncLogEntry,
  UserMatrixMap,
  UserPushToken,
} from './records.js'
