import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ConsentPrefsArea } from './consent-prefs.js'

export class MatrixEventsArea extends ConsentPrefsArea {


  // Matrix event ingestion
  async insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content: string
    originServerTs: number
  }): Promise<boolean> {
    try {
      await this.run(
        'INSERT INTO matrix_events (room_id, event_id, sender, type, content, origin_server_ts) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          event.roomId,
          event.eventId,
          event.sender,
          event.type,
          event.content,
          event.originServerTs,
        ],
      )
      return true
    } catch (err: any) {
      if (err.code === '23505') {
        return false
      }
      throw err
    }
  }


  async eventExists(eventId: string): Promise<boolean> {
    const row = await this.queryOne(
      'SELECT 1 FROM matrix_events WHERE event_id = $1',
      [eventId],
    )
    return !!row
  }


  async getRecentEvents(roomId: string, limit = 100): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM matrix_events WHERE room_id = $1 ORDER BY origin_server_ts DESC LIMIT $2',
      [roomId, limit],
    )
  }


  // Read markers & unread counts
  async setReadMarker(
    did: string,
    roomId: string,
    eventId: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO room_read_markers (did, room_id, last_read_event_id, last_read_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (did, room_id) DO UPDATE SET last_read_event_id = EXCLUDED.last_read_event_id, last_read_at = NOW()`,
      [did, roomId, eventId],
    )
  }


  async getUnreadCount(did: string, roomId: string): Promise<number> {
    const marker = await this.queryOne<{ last_read_event_id: string }>(
      'SELECT last_read_event_id FROM room_read_markers WHERE did = $1 AND room_id = $2',
      [did, roomId],
    )

    if (!marker?.last_read_event_id) {
      const row = await this.queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM matrix_events WHERE room_id = $1 AND origin_server_ts > $2 AND type IN ('m.room.message', 'm.room.encrypted')",
        [roomId, Date.now() - 7 * 24 * 60 * 60 * 1000],
      )
      return Math.min(row?.count ?? 0, 99)
    }

    const row = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM matrix_events me
        WHERE me.room_id = $1 AND me.type IN ('m.room.message', 'm.room.encrypted')
        AND me.origin_server_ts > (
          SELECT origin_server_ts FROM matrix_events WHERE event_id = $2
        )`,
      [roomId, marker.last_read_event_id],
    )
    return row?.count ?? 0
  }


  async getUnreadCountsForDid(
    did: string,
  ): Promise<
    { roomId: string; communityUri: string; slug: string; unread: number }[]
  > {
    const rooms = await this.queryAll<{
      room_id: string
      community_uri: string
      slug: string
    }>(
      `SELECT csm.space_id as room_id, csm.community_uri, csm.slug
       FROM community_space_map csm
       INNER JOIN community_membership_state cms ON cms.community_uri = csm.community_uri
       WHERE cms.did = $1 AND cms.membership_state = 'active' AND csm.space_id IS NOT NULL`,
      [did],
    )

    const chamberRooms = await this.queryAll<{
      room_id: string
      community_uri: string
      slug: string
      kind: string
    }>(
      `SELECT
        CASE ca.chamber
          WHEN 'A' THEN csm.chamber_a_room_id
          WHEN 'B' THEN csm.chamber_b_room_id
        END as room_id,
        csm.community_uri, csm.slug,
        'chamber-' || ca.chamber as kind
       FROM community_space_map csm
       INNER JOIN community_membership_state cms ON cms.community_uri = csm.community_uri AND cms.did = $1 AND cms.membership_state = 'active'
       INNER JOIN chamber_assignment ca ON ca.community_uri = csm.community_uri AND ca.did = $1
       WHERE csm.chamber_mode = 'bicameral'
         AND ((ca.chamber = 'A' AND csm.chamber_a_room_id IS NOT NULL)
           OR (ca.chamber = 'B' AND csm.chamber_b_room_id IS NOT NULL))`,
      [did],
    )

    const allRooms = [...rooms, ...chamberRooms]

    return Promise.all(
      allRooms.map(async (r) => ({
        roomId: r.room_id,
        communityUri: r.community_uri,
        slug: r.slug,
        unread: await this.getUnreadCount(did, r.room_id),
      })),
    )
  }


  async getTotalUnreadForDid(did: string): Promise<number> {
    const counts = await this.getUnreadCountsForDid(did)
    return counts.reduce((sum, c) => sum + c.unread, 0)
  }


  // Get all tracked room IDs
  async getAllRoomIds(): Promise<string[]> {
    const rows = await this.queryAll<{
      space_id: string | null
      chamber_a_room_id: string | null
      chamber_b_room_id: string | null
      observer_room_id: string | null
    }>(
      'SELECT space_id, chamber_a_room_id, chamber_b_room_id, observer_room_id FROM community_space_map',
    )
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
