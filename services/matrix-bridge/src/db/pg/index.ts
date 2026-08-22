import { DeliberationArea } from './deliberation.js'

// Re-exported so existing `from './pg.js'` type imports keep resolving. The
// canonical home for these is interface.ts.
export type {
  AiConsentRecord,
  CommunitySpaceMap,
  CommunityRoomKind,
  CommunityRoomSummary,
  IBridgeDatabase,
  SyncLogEntry,
  UserMatrixMap,
  UserPushToken,
} from '../interface.js'

export class PgBridgeDatabase extends DeliberationArea {}
