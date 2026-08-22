import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { IdentityMatrixArea } from './identity-matrix.js'

export class InfraArea extends IdentityMatrixArea {


  // Sync logging
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
      'SELECT * FROM sync_log WHERE success = 0 ORDER BY created_at DESC LIMIT $1',
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


  async getUserCount(): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM user_matrix_map',
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
