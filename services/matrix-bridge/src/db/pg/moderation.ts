import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord,
  CommunityRoomKind,
  CommunityRoomSummary,
  CommunitySpaceMap,
  SyncLogEntry,
  UserPushToken,
} from '../interface.js'
import { SortitionArea } from './sortition.js'

export class ModerationArea extends SortitionArea {
  // Chat moderation events
  async insertModerationEvent(event: {
    did: string
    communityUri: string
    eventType: string
    reporterDid?: string | null
    reportReason?: string | null
    reportedEventId?: string | null
    sanctionType?: string | null
    sanctionDurationMinutes?: number | null
    sanctionedByDid?: string | null
    matrixRoomId?: string | null
  }): Promise<void> {
    await this.run(
      'INSERT INTO chat_moderation_events (did, community_uri, event_type, reporter_did, report_reason, reported_event_id, sanction_type, sanction_duration_minutes, sanctioned_by_did, matrix_room_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [
        event.did,
        event.communityUri,
        event.eventType,
        event.reporterDid ?? null,
        event.reportReason ?? null,
        event.reportedEventId ?? null,
        event.sanctionType ?? null,
        event.sanctionDurationMinutes ?? null,
        event.sanctionedByDid ?? null,
        event.matrixRoomId ?? null,
      ],
    )
  }

  async getModerationEvents(
    did: string,
    communityUri: string,
    sinceDays = 90,
  ): Promise<any[]> {
    return this.queryAll(
      "SELECT * FROM chat_moderation_events WHERE did = $1 AND community_uri = $2 AND created_at >= NOW() - INTERVAL '1 day' * $3 ORDER BY created_at DESC",
      [did, communityUri, sinceDays],
    )
  }

  async getRecentReportsForCommunity(
    communityUri: string,
    days = 30,
  ): Promise<any[]> {
    return this.queryAll(
      "SELECT id, did, community_uri, event_type, reporter_did, report_reason, reported_event_id, sanction_type, sanction_duration_minutes, sanctioned_by_did, matrix_room_id, created_at FROM chat_moderation_events WHERE community_uri = $1 AND event_type = 'report_received' AND created_at >= NOW() - INTERVAL '1 day' * $2 ORDER BY created_at DESC",
      [communityUri, days],
    )
  }

  /**
   * F4: clear message excerpts captured by earlier versions. Idempotent, runs
   * at start-up. Stopping new writes while leaving the existing rows in place
   * would only fix the finding going forward.
   */
  async purgeReportedMessagePreviews(): Promise<number> {
    const rows = await this.queryAll<{ id: number }>(
      'UPDATE chat_moderation_events SET reported_message_preview = NULL WHERE reported_message_preview IS NOT NULL RETURNING id',
    )
    return rows.length
  }

  async getSanctionEvents(did: string, communityUri: string): Promise<any[]> {
    return this.queryAll(
      "SELECT * FROM chat_moderation_events WHERE did = $1 AND community_uri = $2 AND event_type IN ('mute','ban','sanction_lifted') ORDER BY id ASC",
      [did, communityUri],
    )
  }

  async getSubjectsWithTimedSanctions(
    sinceDays: number,
  ): Promise<{ did: string; communityUri: string }[]> {
    const rows = await this.queryAll<{ did: string; community_uri: string }>(
      "SELECT DISTINCT did, community_uri FROM chat_moderation_events WHERE event_type IN ('mute','ban') AND sanction_duration_minutes IS NOT NULL AND created_at >= NOW() - INTERVAL '1 day' * $1",
      [sinceDays],
    )
    return rows.map((r) => ({ did: r.did, communityUri: r.community_uri }))
  }

  async getReportDismissalsForCommunity(
    communityUri: string,
    days = 30,
  ): Promise<any[]> {
    return this.queryAll(
      "SELECT id, did, reported_event_id, sanctioned_by_did, created_at FROM chat_moderation_events WHERE community_uri = $1 AND event_type = 'report_dismissed' AND created_at >= NOW() - INTERVAL '1 day' * $2 ORDER BY id DESC",
      [communityUri, days],
    )
  }

  async hasReportFrom(
    reporterDid: string,
    did: string,
    communityUri: string,
    reportedEventId: string | null,
    days: number,
  ): Promise<boolean> {
    const rows = await this.queryAll(
      "SELECT 1 AS found FROM chat_moderation_events WHERE event_type = 'report_received' AND reporter_did = $1 AND did = $2 AND community_uri = $3 AND reported_event_id IS NOT DISTINCT FROM $4 AND created_at >= NOW() - INTERVAL '1 day' * $5 LIMIT 1",
      [reporterDid, did, communityUri, reportedEventId, days],
    )
    return rows.length > 0
  }

  // Chat user badges
  async setUserBadge(badge: {
    did: string
    communityUri: string
    badgeType: string
    severity?: string | null
    visibleInChat?: number
    expiresAt?: string | null
  }): Promise<void> {
    await this.run(
      'DELETE FROM chat_user_badges WHERE did = $1 AND community_uri = $2 AND badge_type = $3',
      [badge.did, badge.communityUri, badge.badgeType],
    )
    await this.run(
      'INSERT INTO chat_user_badges (did, community_uri, badge_type, severity, visible_in_chat, expires_at, computed_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [
        badge.did,
        badge.communityUri,
        badge.badgeType,
        badge.severity ?? null,
        badge.visibleInChat ?? 1,
        badge.expiresAt ?? null,
      ],
    )
  }

  async clearUserBadges(did: string, communityUri: string): Promise<void> {
    await this.run(
      'DELETE FROM chat_user_badges WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async getUserBadges(did: string, communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM chat_user_badges WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async getCommunityBadgeSummary(
    communityUri: string,
  ): Promise<{ warning: number; critical: number }> {
    const row = await this.queryOne<{ warning: number; critical: number }>(
      "SELECT COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warning, COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical FROM chat_user_badges WHERE community_uri = $1 AND visible_in_chat = 1 AND (expires_at IS NULL OR expires_at > NOW())",
      [communityUri],
    )
    return row ?? { warning: 0, critical: 0 }
  }

  async expireBadges(): Promise<{ did: string; communityUri: string }[]> {
    const affected = await this.queryAll<{
      did: string
      community_uri: string
    }>(
      'SELECT did, community_uri FROM chat_user_badges WHERE expires_at IS NOT NULL AND expires_at <= NOW()',
    )
    await this.run(
      'DELETE FROM chat_user_badges WHERE expires_at IS NOT NULL AND expires_at <= NOW()',
    )
    return affected.map((r) => ({ did: r.did, communityUri: r.community_uri }))
  }
}
