import type {
  SyncLogEntry, UserPushToken,
} from '../records.js'

export interface InfraStore {

  logSync(
    eventType: string,
    communityUri: string,
    did: string | null,
    spaceId: string | null,
    success: boolean,
    error?: string,
  ): Promise<void>

  getFailedSyncs(limit?: number): Promise<SyncLogEntry[]>

  getRetryCount(entryId: number): Promise<number>

  incrementRetryCount(entryId: number): Promise<void>

  markSyncSuccess(entryId: number): Promise<void>

  getSyncCursor(): Promise<number | undefined>

  setSyncCursor(cursor: number): Promise<void>

  getUserCount(): Promise<number>

  getSpaceCount(): Promise<number>

  setPushToken(
    did: string,
    expoPushToken: string,
    platform: string,
  ): Promise<void>

  getPushToken(did: string): Promise<UserPushToken | undefined>

  getPushTokensByDid(dids: string[]): Promise<UserPushToken[]>
}
