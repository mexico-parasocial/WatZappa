import type { PushDelivery, SyncLogEntry, UserPushToken } from '../records.js'

export interface InfraStore {
  claimPushDelivery(
    id: string,
    token: string,
    owner: string,
    now: number,
  ): Promise<boolean>
  getPushDelivery(id: string): Promise<PushDelivery | undefined>
  completePushDelivery(
    id: string,
    owner: string,
    receiptId: string | null,
    rejected: boolean,
    now: number,
  ): Promise<void>
  releasePushDelivery(id: string, owner: string): Promise<void>
  getPendingPushReceipts(now: number): Promise<PushDelivery[]>
  resolvePushReceipt(
    id: string,
    state: 'provider_accepted' | 'rejected' | 'failed' | 'submitted',
    error: string | null,
    now: number,
  ): Promise<void>
  prunePushDeliveries(before: number): Promise<void>

  logSync(
    eventType: string,
    communityUri: string,
    did: string | null,
    spaceId: string | null,
    success: boolean,
    error?: string,
  ): Promise<void>

  getFailedSyncs(limit?: number): Promise<SyncLogEntry[]>

  getProvisioningRetryJobs(limit?: number): Promise<SyncLogEntry[]>

  getRetryCount(entryId: number): Promise<number>

  incrementRetryCount(entryId: number): Promise<void>

  markSyncSuccess(entryId: number): Promise<void>

  getSyncCursor(): Promise<number | undefined>

  setSyncCursor(cursor: number): Promise<void>

  getSyncSource(): Promise<string | undefined>

  setSyncSource(sourceId: string): Promise<void>

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
