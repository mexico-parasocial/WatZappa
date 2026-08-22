import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ModerationArea } from './moderation.js'

export class ParticipationArea extends ModerationArea {


  // Chat participation stats
  async getParticipationStats(
    did: string,
    communityUri: string,
  ): Promise<any | undefined> {
    return this.queryOne(
      'SELECT * FROM chat_participation_stats WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }


  async ensureParticipationStats(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): Promise<void> {
    await this.run(
      'INSERT INTO chat_participation_stats (did, community_uri, matrix_room_id, joined_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
      [did, communityUri, matrixRoomId ?? null],
    )
  }


  async incrementMessageCount(
    did: string,
    communityUri: string,
  ): Promise<void> {
    await this.run(
      'UPDATE chat_participation_stats SET message_count = message_count + 1, last_message_at = NOW(), updated_at = NOW() WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }


  async incrementVoteCount(did: string, communityUri: string): Promise<void> {
    await this.run(
      'UPDATE chat_participation_stats SET votes_cast = votes_cast + 1, updated_at = NOW() WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }


  async incrementProposalCount(
    did: string,
    communityUri: string,
  ): Promise<void> {
    await this.run(
      'UPDATE chat_participation_stats SET proposals_created = proposals_created + 1, updated_at = NOW() WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }


  async setParticipationRoles(
    did: string,
    communityUri: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): Promise<void> {
    const parts: string[] = []
    const values: (string | number | null)[] = []
    let idx = 1
    if (roles.isDelegate !== undefined) {
      parts.push(`is_delegate = $${idx++}`)
      values.push(roles.isDelegate ? 1 : 0)
    }
    if (roles.isModerator !== undefined) {
      parts.push(`is_moderator = $${idx++}`)
      values.push(roles.isModerator ? 1 : 0)
    }
    if (roles.chamber !== undefined) {
      parts.push(`chamber = $${idx++}`)
      values.push(roles.chamber)
    }
    if (parts.length === 0) return
    values.push(did, communityUri)
    await this.run(
      `UPDATE chat_participation_stats SET ${parts.join(', ')}, last_message_at = NOW(), updated_at = NOW() WHERE did = $${idx++} AND community_uri = $${idx++}`,
      values,
    )
  }


  async getParticipationStatsByCommunity(communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM chat_participation_stats WHERE community_uri = $1 ORDER BY message_count DESC',
      [communityUri],
    )
  }


  async getMemberList(
    communityUri: string,
    limit = 100,
    offset = 0,
  ): Promise<any[]> {
    return this.queryAll(
      'SELECT ps.*, umm.matrix_user_id FROM chat_participation_stats ps LEFT JOIN user_matrix_map umm ON ps.did = umm.did WHERE ps.community_uri = $1 ORDER BY ps.last_message_at DESC LIMIT $2 OFFSET $3',
      [communityUri, limit, offset],
    )
  }


  async getActiveCommunityUris(): Promise<string[]> {
    const rows = await this.queryAll<{ community_uri: string }>(
      "SELECT DISTINCT community_uri FROM chat_participation_stats WHERE last_message_at > NOW() - INTERVAL '1 hour'",
    )
    return rows.map((r) => r.community_uri)
  }
}
