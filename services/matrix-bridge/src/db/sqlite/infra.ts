import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { IdentityMatrixArea } from './identity-matrix.js'

export class InfraArea extends IdentityMatrixArea {


  // Sync logging
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
        'SELECT * FROM sync_log WHERE success = 0 ORDER BY created_at DESC LIMIT ?',
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


  getUserCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM user_matrix_map')
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
