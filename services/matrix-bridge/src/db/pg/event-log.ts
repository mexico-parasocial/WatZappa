import type { BridgeEvent } from '../records.js'
import { InstitutionsArea } from './institutions.js'

/** event_log persistence for the SSE bus (see src/events/bus.ts). */
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

  async appendEvent(event: {
    type: string
    communityUri: string | null
    audienceDids: string[] | null
    payload: unknown
  }): Promise<BridgeEvent> {
    const row = await this.queryOne<any>(
      `INSERT INTO event_log (type, community_uri, audience_dids_json, payload_json)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        event.type,
        event.communityUri,
        event.audienceDids ? JSON.stringify(event.audienceDids) : null,
        JSON.stringify(event.payload ?? {}),
      ],
    )
    return this.mapEvent(row)
  }

  async listEventsAfter(afterSeq: number, limit: number): Promise<BridgeEvent[]> {
    const res = await this.query(
      'SELECT * FROM event_log WHERE seq > $1 ORDER BY seq ASC LIMIT $2',
      [afterSeq, limit],
    )
    return res.rows.map((r) => this.mapEvent(r))
  }

  async getMaxEventSeq(): Promise<number> {
    const row = await this.queryOne<{ max: string }>(
      'SELECT COALESCE(MAX(seq), 0) AS max FROM event_log',
    )
    return Number(row?.max ?? 0)
  }

  async pruneEventsBefore(cutoffIso: string): Promise<number> {
    const res = await this.query('DELETE FROM event_log WHERE created_at < $1', [
      cutoffIso,
    ])
    return res.rowCount ?? 0
  }
}
