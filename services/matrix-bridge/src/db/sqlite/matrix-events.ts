import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ConsentPrefsArea } from './consent-prefs.js'

export class MatrixEventsArea extends ConsentPrefsArea {


  // Matrix event ingestion
  insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content?: string | null
    originServerTs: number
  }): boolean {
    try {
      this.db
        .prepare(
          'INSERT INTO matrix_events (room_id, event_id, sender, type, content, origin_server_ts) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          event.roomId,
          event.eventId,
          event.sender,
          event.type,
          event.content ?? null,
          event.originServerTs,
        )
      return true
    } catch (err: any) {
      // Duplicate event_id — ignore
      if (err.message?.includes('UNIQUE constraint failed')) {
        return false
      }
      throw err
    }
  }


  eventExists(eventId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM matrix_events WHERE event_id = ?')
      .get(eventId) as { 1: number } | undefined
    return !!row
  }


  getRecentEvents(roomId: string, limit = 100): any[] {
    return this.db
      .prepare(
        'SELECT * FROM matrix_events WHERE room_id = ? ORDER BY origin_server_ts DESC LIMIT ?',
      )
      .all(roomId, limit) as any[]
  }


  // Read markers & unread counts
  setReadMarker(did: string, roomId: string, eventId: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO room_read_markers (did, room_id, last_read_event_id, last_read_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(did, roomId, eventId)
  }


  getUnreadCount(did: string, roomId: string): number {
    const marker = this.db
      .prepare(
        'SELECT last_read_event_id FROM room_read_markers WHERE did = ? AND room_id = ?',
      )
      .get(did, roomId) as { last_read_event_id: string } | undefined

    if (!marker?.last_read_event_id) {
      // No marker — count all events in the last 7 days, capped at 99
      const row = this.db
        .prepare(
          "SELECT COUNT(*) as count FROM matrix_events WHERE room_id = ? AND origin_server_ts > ? AND type IN ('m.room.message', 'm.room.encrypted')",
        )
        .get(roomId, Date.now() - 7 * 24 * 60 * 60 * 1000) as { count: number }
      return Math.min(row.count, 99)
    }

    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM matrix_events me
        WHERE me.room_id = ? AND me.type IN ('m.room.message', 'm.room.encrypted')
        AND me.origin_server_ts > (
          SELECT origin_server_ts FROM matrix_events WHERE event_id = ?
        )`,
      )
      .get(roomId, marker.last_read_event_id) as { count: number }
    return row.count
  }


  getUnreadCountsForDid(
    did: string,
  ): Array<CommunityRoomSummary & { unread: number }> {
    return this.getActiveCommunityRoomsForDid(did).map((r) => ({
      roomId: r.roomId,
      communityUri: r.communityUri,
      slug: r.slug,
      kind: r.kind,
      unread: this.getUnreadCount(did, r.roomId),
    }))
  }


  getTotalUnreadForDid(did: string): number {
    const counts = this.getUnreadCountsForDid(did)
    return counts.reduce((sum, c) => sum + c.unread, 0)
  }


  // Get all tracked room IDs
  getAllRoomIds(): string[] {
    const rows = this.db
      .prepare(
        'SELECT space_id, chamber_a_room_id, chamber_b_room_id, observer_room_id FROM community_space_map',
      )
      .all() as Array<{
      space_id: string | null
      chamber_a_room_id: string | null
      chamber_b_room_id: string | null
      observer_room_id: string | null
    }>
    return Array.from(
      new Set(
        rows.flatMap((r) =>
          [
            r.space_id,
            r.chamber_a_room_id,
            r.chamber_b_room_id,
            r.observer_room_id,
          ].filter((id): id is string => Boolean(id)),
        ),
      ),
    )
  }
}
