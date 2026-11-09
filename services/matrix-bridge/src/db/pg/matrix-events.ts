import { ChatPreferencesArea } from './chat-preferences.js'

export class MatrixEventsArea extends ChatPreferencesArea {
  // Matrix event ingestion
  async insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content: string
    originServerTs: number
  }): Promise<boolean> {
    const row = await this.queryOne(
      `INSERT INTO matrix_events (room_id, event_id, sender, type, content, origin_server_ts)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [
        event.roomId,
        event.eventId,
        event.sender,
        event.type,
        event.content,
        event.originServerTs,
      ],
    )
    return row !== undefined
  }

  async getMatrixPollCursor(roomId: string): Promise<string | undefined> {
    return (
      await this.queryOne<{ cursor: string }>(
        'SELECT cursor FROM matrix_poll_cursors WHERE room_id = $1',
        [roomId],
      )
    )?.cursor
  }

  async setMatrixPollCursor(roomId: string, cursor: string): Promise<void> {
    await this.run(
      'INSERT INTO matrix_poll_cursors (room_id, cursor) VALUES ($1, $2) ON CONFLICT (room_id) DO UPDATE SET cursor = excluded.cursor',
      [roomId, cursor],
    )
  }

  async eventExists(eventId: string): Promise<boolean> {
    const row = await this.queryOne(
      'SELECT 1 FROM matrix_events WHERE event_id = $1',
      [eventId],
    )
    return !!row
  }

  async getEventSender(
    roomId: string,
    eventId: string,
  ): Promise<string | undefined> {
    const row = await this.queryOne<{ sender: string }>(
      'SELECT sender FROM matrix_events WHERE room_id = $1 AND event_id = $2',
      [roomId, eventId],
    )
    return row?.sender
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
      const row = await this.queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM matrix_events WHERE room_id = $1 AND origin_server_ts > $2 AND type IN ('m.room.message', 'm.room.encrypted')",
        [roomId, Date.now() - 7 * 24 * 60 * 60 * 1000],
      )
      return Math.min(this.safeInteger(row?.count ?? 0), 99)
    }

    const row = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM matrix_events me
        WHERE me.room_id = $1 AND me.type IN ('m.room.message', 'm.room.encrypted')
        AND me.origin_server_ts > (
          SELECT origin_server_ts FROM matrix_events WHERE event_id = $2
        )`,
      [roomId, marker.last_read_event_id],
    )
    return this.safeInteger(row?.count ?? 0)
  }

  async getUnreadCountsForDid(
    did: string,
  ): Promise<
    { roomId: string; communityUri: string; slug: string; unread: number }[]
  > {
    const rooms = await this.getActiveCommunityRoomsForDid(did)
    return Promise.all(
      rooms.map(async (room) => ({
        ...room,
        unread: await this.getUnreadCount(did, room.roomId),
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

  async recordAsTransaction(txnId: string): Promise<boolean> {
    const row = await this.queryOne<{ txn_id: string } | null>(
      'INSERT INTO as_transactions (txn_id) VALUES ($1) ON CONFLICT (txn_id) DO NOTHING RETURNING txn_id',
      [txnId],
    )
    return row != null
  }
}
