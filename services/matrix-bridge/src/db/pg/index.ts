import { InstitutionsArea } from './institutions.js'

// Re-exported so existing `from './pg.js'` type imports keep resolving. The
// canonical home for these is interface.ts.
export type {
  AiConsentRecord,
  CommunitySpaceMap,
  DeviceSession,
  CommunityRoomKind,
  CommunityRoomSummary,
  IBridgeDatabase,
  SyncLogEntry,
  UserMatrixMap,
  UserPushToken,
} from '../interface.js'

export class PgBridgeDatabase extends InstitutionsArea {}
