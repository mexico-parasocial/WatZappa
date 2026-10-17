import type { SyncLogEntry, UserPushToken } from '../interface.js'
import type { PushDelivery } from '../records.js'
import { IdentityMatrixArea } from './identity-matrix.js'

export class InfraArea extends IdentityMatrixArea {
  async claimPushDelivery(
    id: string,
    token: string,
    owner: string,
    now: number,
  ): Promise<boolean> {
    const result = await this.query(
      `INSERT INTO push_delivery
      (id, token, state, owner, lease_until, created_at, check_after)
      VALUES ($1, $2, 'sending', $3, $4, $5, $6)
      ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, lease_until = excluded.lease_until
      WHERE push_delivery.state = 'sending' AND push_delivery.lease_until <= $5`,
      [id, token, owner, now + 300_000, now, now + 900_000],
    )
    return result.rowCount === 1
  }

  async getPushDelivery(id: string): Promise<PushDelivery | undefined> {
    return this.queryOne<PushDelivery>(
      `SELECT id, token, state, receipt_id AS "receiptId", created_at::float8 AS "createdAt"
      FROM push_delivery WHERE id = $1`,
      [id],
    )
  }

  async completePushDelivery(
    id: string,
    owner: string,
    receiptId: string | null,
    rejected: boolean,
    now: number,
  ): Promise<void> {
    await this.query(
      `UPDATE push_delivery SET state = $1, receipt_id = $2, check_after = $3
      WHERE id = $4 AND owner = $5 AND state = 'sending'`,
      [
        rejected ? 'rejected' : 'submitted',
        receiptId,
        now + 900_000,
        id,
        owner,
      ],
    )
  }

  async releasePushDelivery(id: string, owner: string): Promise<void> {
    await this.query(
      "DELETE FROM push_delivery WHERE id = $1 AND owner = $2 AND state = 'sending'",
      [id, owner],
    )
  }

  async getPendingPushReceipts(now: number): Promise<PushDelivery[]> {
    return this.queryAll<PushDelivery>(
      `SELECT id, token, state, receipt_id AS "receiptId", created_at::float8 AS "createdAt"
      FROM push_delivery WHERE state = 'submitted' AND check_after <= $1
      ORDER BY check_after LIMIT 1000`,
      [now],
    )
  }

  async resolvePushReceipt(
    id: string,
    state: 'provider_accepted' | 'rejected' | 'failed' | 'submitted',
    error: string | null,
    now: number,
  ): Promise<void> {
    await this.query(
      `UPDATE push_delivery SET state = $1, error_code = $2, check_after = $3
      WHERE id = $4 AND state = 'submitted'`,
      [state, error, now + 60_000, id],
    )
  }

  // Sync logging
  async prunePushDeliveries(before: number): Promise<void> {
    await this.query(
      "DELETE FROM push_delivery WHERE state <> 'submitted' AND created_at < $1",
      [before],
    )
  }

  async logSync(
    eventType: string,
    communityUri: string,
    did: string | null,
    spaceId: string | null,
    success: boolean,
    error?: string,
  ): Promise<void> {
    await this.run(
      'INSERT INTO sync_log (event_type, community_uri, did, space_id, success, error) VALUES ($1, $2, $3, $4, $5, $6)',
      [eventType, communityUri, did, spaceId, success ? 1 : 0, error ?? null],
    )
  }

  async getFailedSyncs(limit = 100): Promise<SyncLogEntry[]> {
    return this.queryAll<SyncLogEntry>(
      `SELECT id, event_type AS "eventType", community_uri AS "communityUri",
        did, space_id AS "spaceId", success, retry_count AS "retryCount",
        error, created_at::text AS "createdAt"
       FROM sync_log WHERE success = 0 ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    )
  }

  async getProvisioningRetryJobs(limit = 50): Promise<SyncLogEntry[]> {
    return this.queryAll<SyncLogEntry>(
      `SELECT id, event_type AS "eventType", community_uri AS "communityUri",
      did, space_id AS "spaceId", success, retry_count AS "retryCount", error, created_at::text AS "createdAt"
      FROM sync_log WHERE success = 0 AND event_type = 'create_space'
      ORDER BY retry_count ASC, id ASC LIMIT $1`,
      [limit],
    )
  }

  async getRetryCount(entryId: number): Promise<number> {
    const row = await this.queryOne<{ retry_count: number }>(
      'SELECT retry_count FROM sync_log WHERE id = $1',
      [entryId],
    )
    return row?.retry_count ?? 0
  }

  async incrementRetryCount(entryId: number): Promise<void> {
    await this.run(
      'UPDATE sync_log SET retry_count = retry_count + 1 WHERE id = $1',
      [entryId],
    )
  }

  async markSyncSuccess(entryId: number): Promise<void> {
    await this.run(
      'UPDATE sync_log SET success = 1, error = NULL WHERE id = $1',
      [entryId],
    )
  }

  // Firehose cursor persistence
  async getSyncCursor(): Promise<number | undefined> {
    const row = await this.queryOne<{ cursor: number }>(
      'SELECT cursor FROM sync_cursor WHERE id = 1',
    )
    return row?.cursor
  }

  async setSyncCursor(cursor: number): Promise<void> {
    await this.run(
      `INSERT INTO sync_cursor (id, cursor) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET cursor = EXCLUDED.cursor`,
      [cursor],
    )
  }

  async getSyncSource(): Promise<string | undefined> {
    const row = await this.queryOne<{ source_id: string }>(
      'SELECT source_id FROM sync_source WHERE id = 1',
    )
    return row?.source_id
  }

  async setSyncSource(sourceId: string): Promise<void> {
    await this.run(
      `INSERT INTO sync_source (id, source_id) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id`,
      [sourceId],
    )
  }

  async getUserCount(): Promise<number> {
    // Post-CD-M1 there is no user mapping to count; the meaningful gauge is
    // distinct active members across communities (governance state).
    const row = await this.queryOne<{ count: number }>(
      "SELECT COUNT(DISTINCT did) as count FROM community_membership_state WHERE membership_state = 'active'",
    )
    return row?.count ?? 0
  }

  async getSpaceCount(): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM community_space_map',
    )
    return row?.count ?? 0
  }

  // Push tokens
  async setPushToken(
    did: string,
    expoPushToken: string,
    platform: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO user_push_tokens (did, expo_push_token, platform, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (did) DO UPDATE SET expo_push_token = EXCLUDED.expo_push_token, platform = EXCLUDED.platform, updated_at = NOW()`,
      [did, expoPushToken, platform],
    )
  }

  async getPushToken(did: string): Promise<UserPushToken | undefined> {
    return this.queryOne<UserPushToken>(
      'SELECT * FROM user_push_tokens WHERE did = $1',
      [did],
    )
  }

  async getPushTokensByDid(dids: string[]): Promise<UserPushToken[]> {
    if (dids.length === 0) return []
    return this.queryAll<UserPushToken>(
      'SELECT * FROM user_push_tokens WHERE did = ANY($1)',
      [dids],
    )
  }
}
