import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ModerationArea } from './moderation.js'

export class ParticipationArea extends ModerationArea {


  // Chat participation stats
  getParticipationStats(did: string, communityUri: string): any | undefined {
    return this.db
      .prepare(
        'SELECT * FROM chat_participation_stats WHERE did = ? AND community_uri = ?',
      )
      .get(did, communityUri)
  }


  ensureParticipationStats(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO chat_participation_stats (did, community_uri, matrix_room_id, joined_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(did, communityUri, matrixRoomId ?? null)
  }


  incrementMessageCount(did: string, communityUri: string): void {
    this.db
      .prepare(
        "UPDATE chat_participation_stats SET message_count = message_count + 1, last_message_at = datetime('now'), updated_at = datetime('now') WHERE did = ? AND community_uri = ?",
      )
      .run(did, communityUri)
  }


  incrementVoteCount(did: string, communityUri: string): void {
    this.db
      .prepare(
        "UPDATE chat_participation_stats SET votes_cast = votes_cast + 1, updated_at = datetime('now') WHERE did = ? AND community_uri = ?",
      )
      .run(did, communityUri)
  }


  incrementProposalCount(did: string, communityUri: string): void {
    this.db
      .prepare(
        "UPDATE chat_participation_stats SET proposals_created = proposals_created + 1, updated_at = datetime('now') WHERE did = ? AND community_uri = ?",
      )
      .run(did, communityUri)
  }


  setParticipationRoles(
    did: string,
    communityUri: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): void {
    const parts: string[] = []
    const values: (string | number | null)[] = []
    if (roles.isDelegate !== undefined) {
      parts.push('is_delegate = ?')
      values.push(roles.isDelegate ? 1 : 0)
    }
    if (roles.isModerator !== undefined) {
      parts.push('is_moderator = ?')
      values.push(roles.isModerator ? 1 : 0)
    }
    if (roles.chamber !== undefined) {
      parts.push('chamber = ?')
      values.push(roles.chamber)
    }
    if (parts.length === 0) return
    values.push(did, communityUri)
    this.db
      .prepare(
        `UPDATE chat_participation_stats SET ${parts.join(', ')}, updated_at = datetime('now') WHERE did = ? AND community_uri = ?`,
      )
      .run(...values)
  }


  getParticipationStatsByCommunity(communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM chat_participation_stats WHERE community_uri = ? ORDER BY message_count DESC',
      )
      .all(communityUri) as any[]
  }


  getMemberList(communityUri: string, limit = 100, offset = 0): any[] {
    return this.db
      .prepare(
        'SELECT ps.*, umm.matrix_user_id FROM chat_participation_stats ps LEFT JOIN user_matrix_map umm ON ps.did = umm.did WHERE ps.community_uri = ? ORDER BY ps.last_message_at DESC LIMIT ? OFFSET ?',
      )
      .all(communityUri, limit, offset) as any[]
  }


  getActiveCommunityUris(): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT community_uri FROM chat_participation_stats WHERE last_message_at > datetime('now', '-1 hour')",
      )
      .all() as { community_uri: string }[]
    return rows.map((r) => r.community_uri)
  }
}
