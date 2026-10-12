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
  insertModerationEvent(event: {
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
  }): void {
    this.db
      .prepare(
        'INSERT INTO chat_moderation_events (did, community_uri, event_type, reporter_did, report_reason, reported_event_id, sanction_type, sanction_duration_minutes, sanctioned_by_did, matrix_room_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
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
      )
  }

  getModerationEvents(
    did: string,
    communityUri: string,
    sinceDays = 90,
  ): any[] {
    return this.db
      .prepare(
        "SELECT * FROM chat_moderation_events WHERE did = ? AND community_uri = ? AND created_at >= datetime('now', '-' || ? || ' days') ORDER BY created_at DESC",
      )
      .all(did, communityUri, sinceDays) as any[]
  }

  getRecentReportsForCommunity(communityUri: string, days = 30): any[] {
    return this.db
      .prepare(
        "SELECT id, did, community_uri, event_type, reporter_did, report_reason, reported_event_id, sanction_type, sanction_duration_minutes, sanctioned_by_did, matrix_room_id, created_at FROM chat_moderation_events WHERE community_uri = ? AND event_type = 'report_received' AND created_at >= datetime('now', '-' || ? || ' days') ORDER BY created_at DESC",
      )
      .all(communityUri, days) as any[]
  }

  /**
   * F4: clear message excerpts captured by earlier versions. Idempotent, runs
   * at start-up. Stopping new writes while leaving the existing rows in place
   * would only fix the finding going forward.
   */
  purgeReportedMessagePreviews(): number {
    const info = this.db
      .prepare(
        'UPDATE chat_moderation_events SET reported_message_preview = NULL WHERE reported_message_preview IS NOT NULL',
      )
      .run()
    return info.changes
  }

  getSanctionEvents(did: string, communityUri: string): any[] {
    return this.db
      .prepare(
        "SELECT * FROM chat_moderation_events WHERE did = ? AND community_uri = ? AND event_type IN ('mute','ban','sanction_lifted') ORDER BY id ASC",
      )
      .all(did, communityUri) as any[]
  }

  getSubjectsWithTimedSanctions(
    sinceDays: number,
  ): { did: string; communityUri: string }[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT did, community_uri FROM chat_moderation_events WHERE event_type IN ('mute','ban') AND sanction_duration_minutes IS NOT NULL AND created_at >= datetime('now', '-' || ? || ' days')",
      )
      .all(sinceDays) as { did: string; community_uri: string }[]
    return rows.map((r) => ({ did: r.did, communityUri: r.community_uri }))
  }

  getReportDismissalsForCommunity(communityUri: string, days = 30): any[] {
    return this.db
      .prepare(
        "SELECT id, did, reported_event_id, sanctioned_by_did, created_at FROM chat_moderation_events WHERE community_uri = ? AND event_type = 'report_dismissed' AND created_at >= datetime('now', '-' || ? || ' days') ORDER BY id DESC",
      )
      .all(communityUri, days) as any[]
  }

  hasReportFrom(
    reporterDid: string,
    did: string,
    communityUri: string,
    reportedEventId: string | null,
    days: number,
  ): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 AS found FROM chat_moderation_events WHERE event_type = 'report_received' AND reporter_did = ? AND did = ? AND community_uri = ? AND reported_event_id IS ? AND created_at >= datetime('now', '-' || ? || ' days') LIMIT 1",
      )
      .get(reporterDid, did, communityUri, reportedEventId, days)
    return row !== undefined
  }

  // Chat user badges (computed cache)
  setUserBadge(badge: {
    did: string
    communityUri: string
    badgeType: string
    severity?: string | null
    visibleInChat?: number
    expiresAt?: string | null
  }): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO chat_user_badges (did, community_uri, badge_type, severity, visible_in_chat, expires_at, computed_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
      )
      .run(
        badge.did,
        badge.communityUri,
        badge.badgeType,
        badge.severity ?? null,
        badge.visibleInChat ?? 1,
        badge.expiresAt ?? null,
      )
  }

  clearUserBadges(did: string, communityUri: string): void {
    this.db
      .prepare(
        'DELETE FROM chat_user_badges WHERE did = ? AND community_uri = ?',
      )
      .run(did, communityUri)
  }

  getUserBadges(did: string, communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM chat_user_badges WHERE did = ? AND community_uri = ?',
      )
      .all(did, communityUri) as any[]
  }

  getCommunityBadgeSummary(communityUri: string): {
    warning: number
    critical: number
  } {
    const row = this.db
      .prepare(
        "SELECT COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warning, COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical FROM chat_user_badges WHERE community_uri = ? AND visible_in_chat = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
      )
      .get(communityUri) as { warning: number; critical: number }
    return row
  }

  expireBadges(): { did: string; communityUri: string }[] {
    const affected = this.db
      .prepare(
        "SELECT did, community_uri FROM chat_user_badges WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')",
      )
      .all() as { did: string; community_uri: string }[]
    this.db
      .prepare(
        "DELETE FROM chat_user_badges WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')",
      )
      .run()
    return affected.map((r) => ({ did: r.did, communityUri: r.community_uri }))
  }
}
