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
  upsertDmRequest(
    request: DmRequest,
    now: string,
  ): { id: string; expiresAt: string; created: boolean } {
    return this.db.transaction(() => {
      this.db
        .prepare(
          `DELETE FROM dm_requests WHERE requester_did = ? AND recipient_did = ?
             AND (expires_at <= ? OR status = 'accepted')`,
        )
        .run(request.requesterDid, request.recipientDid, now)
      const inserted = this.db
        .prepare(
          `INSERT OR IGNORE INTO dm_requests
             (id, requester_did, requester_mxid, recipient_did, status, created_at, expires_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .run(
          request.id,
          request.requesterDid,
          request.requesterMxid,
          request.recipientDid,
          request.createdAt,
          request.expiresAt,
        ).changes
      if (!inserted) {
        this.db
          .prepare(
            'UPDATE dm_requests SET requester_mxid = ? WHERE requester_did = ? AND recipient_did = ?',
          )
          .run(
            request.requesterMxid,
            request.requesterDid,
            request.recipientDid,
          )
      }
      const row = this.db
        .prepare(
          'SELECT id, expires_at FROM dm_requests WHERE requester_did = ? AND recipient_did = ?',
        )
        .get(request.requesterDid, request.recipientDid) as {
        id: string
        expires_at: string
      }
      return { id: row.id, expiresAt: row.expires_at, created: inserted > 0 }
    })()
  }

  countPendingDmRequestsFrom(requesterDid: string, now: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM dm_requests
         WHERE requester_did = ? AND status = 'pending' AND expires_at > ?`,
      )
      .get(requesterDid, now) as { n: number }
    return row.n
  }

  listDmRequests(
    did: string,
    now: string,
  ): { incoming: DmRequestSummary[]; outgoing: DmRequestSummary[] } {
    const select = (where: string) =>
      (
        this.db
          .prepare(
            `SELECT id, requester_did, recipient_did, status, created_at, expires_at
             FROM dm_requests WHERE ${where} AND expires_at > ?
             ORDER BY created_at DESC`,
          )
          .all(did, now) as Row[]
      ).map(summary)
    return {
      incoming: select("recipient_did = ? AND status = 'pending'"),
      outgoing: select('requester_did = ?'),
    }
  }

  takeDmRequest(
    id: string,
    recipientDid: string,
    now: string,
  ): { requesterDid: string; requesterMxid: string } | undefined {
    return this.db.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT requester_did, requester_mxid FROM dm_requests
           WHERE id = ? AND recipient_did = ? AND status = 'pending' AND expires_at > ?`,
        )
        .get(id, recipientDid, now) as
        { requester_did: string; requester_mxid: string } | undefined
      if (!row) return undefined
      this.db
        .prepare(
          "UPDATE dm_requests SET status = 'accepted', requester_mxid = '' WHERE id = ?",
        )
        .run(id)
      return {
        requesterDid: row.requester_did,
        requesterMxid: row.requester_mxid,
      }
    })()
  }

  deleteDmRequest(id: string, did: string): boolean {
    return (
      this.db
        .prepare(
          'DELETE FROM dm_requests WHERE id = ? AND (recipient_did = ? OR requester_did = ?)',
        )
        .run(id, did, did).changes > 0
    )
  }

  purgeExpiredDmRequests(now: string): number {
    return this.db
      .prepare('DELETE FROM dm_requests WHERE expires_at <= ?')
      .run(now).changes
  }
}
