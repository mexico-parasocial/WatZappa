/**
 * Canonical database surface for the bridge, composed from per-domain stores
 * in ./stores/. Record types live in ./records.js. Every consumer type-imports
 * IBridgeDatabase from here; implementations (sqlite, postgres) and the async
 * sqlite wrapper all satisfy it.
 */
import type {
  ChatPreferencesStore,
  ConstitutionStore,
  DmRequestsStore,
  EventLogStore,
  IdentityMatrixStore,
  InfraStore,
  MatrixEventsStore,
  ModerationStore,
} from './stores/index.js'

export interface IBridgeDatabase
  extends
    IdentityMatrixStore,
    InfraStore,
    ConstitutionStore,
    ModerationStore,
    ChatPreferencesStore,
    MatrixEventsStore,
    EventLogStore,
    DmRequestsStore {
  /** Database-only work: never perform network calls inside this transaction. */
  transaction<T>(work: () => Promise<T>): Promise<T>
  close(): Promise<void>
}

export type {
  ChatPreferencesStore,
  ConstitutionStore,
  DmRequestsStore,
  IdentityMatrixStore,
  InfraStore,
  MatrixEventsStore,
  ModerationStore,
} from './stores/index.js'
export type {
  BridgeEvent,
  CommunityRoomKind,
  CommunityRoomSummary,
  CommunitySpaceMap,
  DeviceSession,
  DmRequest,
  DmRequestSummary,
  SyncLogEntry,
  UserPushToken,
} from './records.js'
