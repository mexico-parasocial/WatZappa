/**
 * Canonical database surface for the bridge, composed from per-domain stores
 * in ./stores/. Record types live in ./records.js. Every consumer type-imports
 * IBridgeDatabase from here; implementations (sqlite, postgres) and the async
 * sqlite wrapper all satisfy it.
 */

import type {
  ConsentPrefsStore,
  ConstitutionProposalsStore,
  DeliberationStore,
  EventLogStore,
  IdentityMatrixStore,
  InfraStore,
  InstitutionStore,
  MatrixEventsStore,
  ModerationStore,
  ParticipationStore,
  SortitionStore,
} from './stores/index.js'

export interface IBridgeDatabase
  extends
    IdentityMatrixStore,
    InfraStore,
    ConstitutionProposalsStore,
    SortitionStore,
    ModerationStore,
    ParticipationStore,
    ConsentPrefsStore,
    MatrixEventsStore,
    DeliberationStore,
    InstitutionStore,
    EventLogStore {
  /** Database-only work: never perform network calls inside this transaction. */
  transaction<T>(work: () => Promise<T>): Promise<T>
  close(): Promise<void>
}

export type {
  ConsentPrefsStore,
  ConstitutionProposalsStore,
  DeliberationStore,
  IdentityMatrixStore,
  InfraStore,
  InstitutionStore,
  MatrixEventsStore,
  ModerationStore,
  ParticipationStore,
  SortitionStore,
} from './stores/index.js'
export type {
  AiConsentRecord,
  BridgeEvent,
  CommunityRoomKind,
  CommunityRoomSummary,
  CommunitySpaceMap,
  DeviceSession,
  SyncLogEntry,
  UserPushToken,
} from './records.js'
