import { EventLogArea } from './event-log.js'

// Re-exported so existing `from './pg.js'` type imports keep resolving. The
// canonical home for these is interface.ts.
export type {
  AiConsentRecord,
  CommunityRoomKind,
  CommunityRoomSummary,
  CommunitySpaceMap,
  DeviceSession,
  IBridgeDatabase,
  SyncLogEntry,
  UserPushToken,
} from '../interface.js'

export class PgBridgeDatabase extends EventLogArea {}
