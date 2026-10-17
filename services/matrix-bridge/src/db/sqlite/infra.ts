import type { SyncLogEntry, UserPushToken } from '../interface.js'
import type { PushDelivery } from '../records.js'
import { IdentityMatrixArea } from './identity-matrix.js'

export class InfraArea extends IdentityMatrixArea {
  claimPushDelivery(
    id: string,
    token: string,
    owner: string,
    now: number,
  ): boolean {
    return (
      this.db
        .prepare(
          `INSERT INTO push_delivery
      (id, token, state, owner, lease_until, created_at, check_after)
      VALUES (?, ?, 'sending', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, lease_until = excluded.lease_until
      WHERE push_delivery.state = 'sending' AND push_delivery.lease_until <= ?`,
        )
        .run(id, token, owner, now + 300_000, now, now + 900_000, now)
        .changes === 1
    )
  }

  getPushDelivery(id: string): PushDelivery | undefined {
    return this.db
      .prepare(
        `SELECT id, token, state, receipt_id AS receiptId, created_at AS createdAt
      FROM push_delivery WHERE id = ?`,
      )
      .get(id) as PushDelivery | undefined
  }

  completePushDelivery(
    id: string,
    owner: string,
    receiptId: string | null,
    rejected: boolean,
    now: number,
  ): void {
    this.db
      .prepare(
        `UPDATE push_delivery SET state = ?, receipt_id = ?, check_after = ?
      WHERE id = ? AND owner = ? AND state = 'sending'`,
      )
      .run(
        rejected ? 'rejected' : 'submitted',
        receiptId,
        now + 900_000,
        id,
        owner,
      )
  }

  releasePushDelivery(id: string, owner: string): void {
    this.db
      .prepare(
        "DELETE FROM push_delivery WHERE id = ? AND owner = ? AND state = 'sending'",
      )
      .run(id, owner)
  }

  getPendingPushReceipts(now: number): PushDelivery[] {
    return this.db
      .prepare(
        `SELECT id, token, state, receipt_id AS receiptId, created_at AS createdAt
      FROM push_delivery WHERE state = 'submitted' AND check_after <= ?
      ORDER BY check_after LIMIT 1000`,
      )
      .all(now) as PushDelivery[]
  }

  resolvePushReceipt(
    id: string,
    state: 'provider_accepted' | 'rejected' | 'failed' | 'submitted',
    error: string | null,
    now: number,
  ): void {
    this.db
      .prepare(
        `UPDATE push_delivery SET state = ?, error_code = ?, check_after = ?
      WHERE id = ? AND state = 'submitted'`,
      )
      .run(state, error, now + 60_000, id)
  }

  // Sync logging
  prunePushDeliveries(before: number): void {
    this.db
      .prepare(
        "DELETE FROM push_delivery WHERE state <> 'submitted' AND created_at < ?",
      )
      .run(before)
  }

  logSync(
    eventType: string,
    communityUri: string,
    did: string | null,
    spaceId: string | null,
    success: boolean,
    error?: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO sync_log (event_type, community_uri, did, space_id, success, error) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        eventType,
        communityUri,
        did,
        spaceId,
        success ? 1 : 0,
        error ?? null,
      )
  }

  getFailedSyncs(limit = 100): SyncLogEntry[] {
    return this.db
      .prepare(
        `SELECT id, event_type AS "eventType", community_uri AS "communityUri",
          did, space_id AS "spaceId", success, retry_count AS "retryCount",
          error, created_at AS "createdAt"
         FROM sync_log WHERE success = 0 ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(limit) as SyncLogEntry[]
  }

  getProvisioningRetryJobs(limit = 50): SyncLogEntry[] {
    return this.db
      .prepare(
        `SELECT id, event_type AS "eventType", community_uri AS "communityUri",
      did, space_id AS "spaceId", success, retry_count AS "retryCount", error, created_at AS "createdAt"
      FROM sync_log WHERE success = 0 AND event_type = 'create_space'
      ORDER BY retry_count ASC, id ASC LIMIT ?`,
      )
      .all(limit) as SyncLogEntry[]
  }

  getRetryCount(entryId: number): number {
    const row = this.db
      .prepare('SELECT retry_count FROM sync_log WHERE id = ?')
      .get(entryId) as { retry_count: number } | undefined
    return row?.retry_count ?? 0
  }

  incrementRetryCount(entryId: number): void {
    this.db
      .prepare('UPDATE sync_log SET retry_count = retry_count + 1 WHERE id = ?')
      .run(entryId)
  }

  markSyncSuccess(entryId: number): void {
    this.db
      .prepare('UPDATE sync_log SET success = 1, error = NULL WHERE id = ?')
      .run(entryId)
  }

  // Firehose cursor persistence
  getSyncCursor(): number | undefined {
    const row = this.db
      .prepare('SELECT cursor FROM sync_cursor WHERE id = 1')
      .get() as { cursor: number } | undefined
    return row?.cursor
  }

  setSyncCursor(cursor: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO sync_cursor (id, cursor) VALUES (1, ?)')
      .run(cursor)
  }

  getSyncSource(): string | undefined {
    const row = this.db
      .prepare('SELECT source_id FROM sync_source WHERE id = 1')
      .get() as { source_id: string } | undefined
    return row?.source_id
  }

  setSyncSource(sourceId: string): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO sync_source (id, source_id) VALUES (1, ?)',
      )
      .run(sourceId)
  }

  getUserCount(): number {
    // Post-CD-M1 there is no user mapping to count; the meaningful gauge is
    // distinct active members across communities (governance state).
    const row = this.db
      .prepare(
        "SELECT COUNT(DISTINCT did) as count FROM community_membership_state WHERE membership_state = 'active'",
      )
      .get() as { count: number }
    return row.count
  }

  getSpaceCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM community_space_map')
      .get() as { count: number }
    return row.count
  }

  // Push tokens
  setPushToken(did: string, expoPushToken: string, platform: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO user_push_tokens (did, expo_push_token, platform, updated_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(did, expoPushToken, platform)
  }

  getPushToken(did: string): UserPushToken | undefined {
    return this.db
      .prepare('SELECT * FROM user_push_tokens WHERE did = ?')
      .get(did) as UserPushToken | undefined
  }

  getPushTokensByDid(dids: string[]): UserPushToken[] {
    if (dids.length === 0) return []
    const placeholders = dids.map(() => '?').join(',')
    return this.db
      .prepare(`SELECT * FROM user_push_tokens WHERE did IN (${placeholders})`)
      .all(...dids) as UserPushToken[]
  }
}
