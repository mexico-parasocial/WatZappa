import type {
  DmRequest,
  DmRequestStatus,
  DmRequestSummary,
} from '../records.js'
import { EventLogArea } from './event-log.js'

type Row = {
  id: string
  requester_did: string
  recipient_did: string
  status: DmRequestStatus
  created_at: string
  expires_at: string
}

const summary = (r: Row): DmRequestSummary => ({
  id: r.id,
  requesterDid: r.requester_did,
  recipientDid: r.recipient_did,
  status: r.status,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
})

export class DmRequestsArea extends EventLogArea {
  async upsertDmRequest(
    request: DmRequest,
    now: string,
  ): Promise<{ id: string; expiresAt: string; created: boolean }> {
    return this.transaction(async () => {
      await this.run(
        `DELETE FROM dm_requests WHERE requester_did = $1 AND recipient_did = $2
           AND (expires_at <= $3 OR status = 'accepted')`,
        [request.requesterDid, request.recipientDid, now],
      )
      const row = await this.queryOne<{
        id: string
        expires_at: string
        inserted: boolean
      }>(
        `INSERT INTO dm_requests
           (id, requester_did, requester_mxid, recipient_did, status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6)
         ON CONFLICT (requester_did, recipient_did)
           DO UPDATE SET requester_mxid = EXCLUDED.requester_mxid
         RETURNING id, expires_at, (xmax = 0) AS inserted`,
        [
          request.id,
          request.requesterDid,
          request.requesterMxid,
          request.recipientDid,
          request.createdAt,
          request.expiresAt,
        ],
      )
      return {
        id: row!.id,
        expiresAt: row!.expires_at,
        created: row!.inserted,
      }
    })
  }

  async countPendingDmRequestsFrom(
    requesterDid: string,
    now: string,
  ): Promise<number> {
    const row = await this.queryOne<{ n: string }>(
      `SELECT COUNT(*) AS n FROM dm_requests
       WHERE requester_did = $1 AND status = 'pending' AND expires_at > $2`,
      [requesterDid, now],
    )
    return Number(row?.n ?? 0)
  }

  async listDmRequests(
    did: string,
    now: string,
  ): Promise<{ incoming: DmRequestSummary[]; outgoing: DmRequestSummary[] }> {
    const select = async (where: string) =>
      (
        await this.queryAll<Row>(
          `SELECT id, requester_did, recipient_did, status, created_at, expires_at
           FROM dm_requests WHERE ${where} AND expires_at > $2
           ORDER BY created_at DESC`,
          [did, now],
        )
      ).map(summary)
    return {
      incoming: await select("recipient_did = $1 AND status = 'pending'"),
      outgoing: await select('requester_did = $1'),
    }
  }

  async takeDmRequest(
    id: string,
    recipientDid: string,
    now: string,
  ): Promise<{ requesterDid: string; requesterMxid: string } | undefined> {
    // The CTE reads the MXID as it was before the UPDATE blanks it.
    const row = await this.queryOne<{
      requester_did: string
      requester_mxid: string
    }>(
      `WITH old AS (
         SELECT id, requester_did, requester_mxid FROM dm_requests
         WHERE id = $1 AND recipient_did = $2 AND status = 'pending' AND expires_at > $3
         FOR UPDATE
       )
       UPDATE dm_requests d SET status = 'accepted', requester_mxid = ''
       FROM old WHERE d.id = old.id
       RETURNING old.requester_did, old.requester_mxid`,
      [id, recipientDid, now],
    )
    if (!row) return undefined
    return {
      requesterDid: row.requester_did,
      requesterMxid: row.requester_mxid,
    }
  }

  async deleteDmRequest(id: string, did: string): Promise<boolean> {
    const res = await this.query(
      'DELETE FROM dm_requests WHERE id = $1 AND (recipient_did = $2 OR requester_did = $2)',
      [id, did],
    )
    return (res.rowCount ?? 0) > 0
  }

  async purgeExpiredDmRequests(now: string): Promise<number> {
    const res = await this.query(
      'DELETE FROM dm_requests WHERE expires_at <= $1',
      [now],
    )
    return res.rowCount ?? 0
  }
}
