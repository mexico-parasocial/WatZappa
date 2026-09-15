import type { BridgeEvent } from '../records.js'
import { InstitutionsArea } from './institutions.js'

/**
 * event_log persistence for the SSE bus (see src/events/bus.ts).
 * Extends the area chain's end so BridgeDatabase inherits everything.
 */
export class EventLogArea extends InstitutionsArea {
  private mapEvent(row: any): BridgeEvent {
    let audience: string[] | null = null
    try {
      audience = row.audience_dids_json ? JSON.parse(row.audience_dids_json) : null
    } catch {
      audience = null
    }
    let payload: unknown = null
    try {
      payload = row.payload_json ? JSON.parse(row.payload_json) : null
    } catch {
      payload = null
    }
    return {
      seq: Number(row.seq),
      type: row.type,
      communityUri: row.community_uri ?? null,
      audienceDids: audience,
      payload,
      createdAt: row.created_at,
    }
  }

  appendEvent(event: {
    type: string
    communityUri: string | null
    audienceDids: string[] | null
    payload: unknown
  }): BridgeEvent {
    const res = this.db
      .prepare(
        `INSERT INTO event_log (type, community_uri, audience_dids_json, payload_json)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        event.type,
        event.communityUri,
        event.audienceDids ? JSON.stringify(event.audienceDids) : null,
        JSON.stringify(event.payload ?? {}),
      )
    const row = this.db
      .prepare('SELECT * FROM event_log WHERE seq = ?')
      .get(Number(res.lastInsertRowid)) as any
    return this.mapEvent(row)
  }

  listEventsAfter(afterSeq: number, limit: number): BridgeEvent[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM event_log WHERE seq > ? ORDER BY seq ASC LIMIT ?',
      )
      .all(afterSeq, limit) as any[]
    return rows.map((r) => this.mapEvent(r))
  }

  getMaxEventSeq(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS max FROM event_log')
      .get() as { max: number }
    return Number(row.max)
  }

  pruneEventsBefore(cutoffIso: string): number {
    const res = this.db
      .prepare('DELETE FROM event_log WHERE created_at < ?')
      .run(cutoffIso)
    return res.changes
  }
}
