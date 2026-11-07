import { AsyncLocalStorage } from 'node:async_hooks'
import type { Config } from '../config.js'
import type {
  CommunitySpaceMap,
  DeviceSession,
  IBridgeDatabase,
  SyncLogEntry,
  UserPushToken,
} from './pg/index.js'
import type {
  BridgeEvent,
  DmRequest,
  DmRequestSummary,
  PushDelivery,
} from './records.js'
import { BridgeDatabase } from './sqlite/index.js'

/**
 * Async wrapper around the synchronous SQLite BridgeDatabase.
 * Implements IBridgeDatabase so it can be used interchangeably with PgBridgeDatabase.
 */
export class SqliteBridgeDatabase implements IBridgeDatabase {
  private inner: BridgeDatabase
  private transactionContext = new AsyncLocalStorage<{ active: boolean }>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(config: Config) {
    this.inner = new BridgeDatabase(config)
  }

  private exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(fn)
    this.queue = result.catch(() => {})
    return result
  }

  private wrap<T>(fn: () => T): Promise<T> {
    if (this.transactionContext.getStore()?.active) {
      return Promise.resolve().then(fn)
    }
    return this.exclusive(fn)
  }

  transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore()?.active) return work()
    return this.exclusive(async () => {
      this.inner.beginTransaction()
      const context = { active: true }
      try {
        const result = await this.transactionContext.run(context, work)
        this.inner.commitTransaction()
        return result
      } catch (err) {
        this.inner.rollbackTransaction()
        throw err
      } finally {
        context.active = false
      }
    })
  }

  claimPushDelivery(
    id: string,
    token: string,
    owner: string,
    now: number,
  ): Promise<boolean> {
    return this.wrap(() => this.inner.claimPushDelivery(id, token, owner, now))
  }
  getPushDelivery(id: string): Promise<PushDelivery | undefined> {
    return this.wrap(() => this.inner.getPushDelivery(id))
  }
  completePushDelivery(
    id: string,
    owner: string,
    receiptId: string | null,
    rejected: boolean,
    now: number,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.completePushDelivery(id, owner, receiptId, rejected, now),
    )
  }
  releasePushDelivery(id: string, owner: string): Promise<void> {
    return this.wrap(() => this.inner.releasePushDelivery(id, owner))
  }
  getPendingPushReceipts(now: number): Promise<PushDelivery[]> {
    return this.wrap(() => this.inner.getPendingPushReceipts(now))
  }
  resolvePushReceipt(
    id: string,
    state: 'provider_accepted' | 'rejected' | 'failed' | 'submitted',
    error: string | null,
    now: number,
  ): Promise<void> {
    return this.wrap(() => this.inner.resolvePushReceipt(id, state, error, now))
  }

  // ── Community / Space ──
  prunePushDeliveries(before: number): Promise<void> {
    return this.wrap(() => this.inner.prunePushDeliveries(before))
  }

  getSpaceForCommunity(
    communityUri: string,
  ): Promise<CommunitySpaceMap | undefined> {
    return this.wrap(() => this.inner.getSpaceForCommunity(communityUri))
  }

  setSpaceForCommunity(
    communityUri: string,
    spaceId: string,
    slug: string,
    chamberMode = 'unicameral',
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.setSpaceForCommunity(communityUri, spaceId, slug, chamberMode),
    )
  }

  setChamberRooms(
    communityUri: string,
    chamberA: string | null,
    chamberB: string | null,
    observerRoom: string | null,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.setChamberRooms(
        communityUri,
        chamberA,
        chamberB,
        observerRoom,
      ),
    )
  }

  getActiveMemberCount(communityUri: string): Promise<number> {
    return this.wrap(() => this.inner.getActiveMemberCount(communityUri))
  }

  // ── Sync ──

  logSync(
    eventType: string,
    communityUri: string,
    did: string | null,
    spaceId: string | null,
    success: boolean,
    error?: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.logSync(eventType, communityUri, did, spaceId, success, error),
    )
  }

  getFailedSyncs(limit = 100): Promise<SyncLogEntry[]> {
    return this.wrap(() => this.inner.getFailedSyncs(limit))
  }

  getAccessRetryJobs(limit = 50): Promise<SyncLogEntry[]> {
    return this.wrap(() => this.inner.getAccessRetryJobs(limit))
  }

  getProvisioningRetryJobs(limit = 50): Promise<SyncLogEntry[]> {
    return this.wrap(() => this.inner.getProvisioningRetryJobs(limit))
  }

  getRetryCount(entryId: number): Promise<number> {
    return this.wrap(() => this.inner.getRetryCount(entryId))
  }

  incrementRetryCount(entryId: number): Promise<void> {
    return this.wrap(() => this.inner.incrementRetryCount(entryId))
  }

  markSyncSuccess(entryId: number): Promise<void> {
    return this.wrap(() => this.inner.markSyncSuccess(entryId))
  }

  getSyncCursor(): Promise<number | undefined> {
    return this.wrap(() => this.inner.getSyncCursor())
  }

  setSyncCursor(cursor: number): Promise<void> {
    return this.wrap(() => this.inner.setSyncCursor(cursor))
  }

  getSyncSource(): Promise<string | undefined> {
    return this.wrap(() => this.inner.getSyncSource())
  }

  setSyncSource(sourceId: string): Promise<void> {
    return this.wrap(() => this.inner.setSyncSource(sourceId))
  }

  // ── Stats ──

  getUserCount(): Promise<number> {
    return this.wrap(() => this.inner.getUserCount())
  }

  getSpaceCount(): Promise<number> {
    return this.wrap(() => this.inner.getSpaceCount())
  }

  // ── Push ──

  setPushToken(
    did: string,
    expoPushToken: string,
    platform: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.setPushToken(did, expoPushToken, platform),
    )
  }

  getPushToken(did: string): Promise<UserPushToken | undefined> {
    return this.wrap(() => this.inner.getPushToken(did))
  }

  getPushTokensByDid(dids: string[]): Promise<UserPushToken[]> {
    return this.wrap(() => this.inner.getPushTokensByDid(dids))
  }

  // ── Room / Community lookup ──

  getCommunityByRoomId(
    roomId: string,
  ): Promise<{ communityUri: string; slug: string } | undefined> {
    return this.wrap(() => this.inner.getCommunityByRoomId(roomId))
  }

  async createDeviceSession(session: DeviceSession): Promise<void> {
    await this.wrap(() => this.inner.createDeviceSession(session))
  }

  async listDeviceSessions(did: string): Promise<DeviceSession[]> {
    return this.wrap(() => this.inner.listDeviceSessions(did))
  }

  async getDeviceSession(id: string): Promise<DeviceSession | undefined> {
    return this.wrap(() => this.inner.getDeviceSession(id))
  }

  queueDeviceRevocation(did: string, id: string): Promise<void> {
    return this.wrap(() => this.inner.queueDeviceRevocation(did, id))
  }
  getPendingDeviceRevocations(limit = 50): Promise<DeviceSession[]> {
    return this.wrap(() => this.inner.getPendingDeviceRevocations(limit))
  }
  incrementDeviceRevocationAttempts(id: string): Promise<void> {
    return this.wrap(() => this.inner.incrementDeviceRevocationAttempts(id))
  }
  deleteDeviceRevocation(id: string): Promise<void> {
    return this.wrap(() => this.inner.deleteDeviceRevocation(id))
  }

  async touchDeviceSession(id: string): Promise<void> {
    await this.wrap(() => this.inner.touchDeviceSession(id))
  }

  async revokeDeviceSession(did: string, id: string): Promise<boolean> {
    return this.wrap(() => this.inner.revokeDeviceSession(did, id))
  }

  async appendEvent(event: {
    type: string
    communityUri: string | null
    audienceDids: string[] | null
    payload: unknown
  }): Promise<BridgeEvent> {
    return this.wrap(() => this.inner.appendEvent(event))
  }

  async listEventsAfter(
    afterSeq: number,
    limit: number,
  ): Promise<BridgeEvent[]> {
    return this.wrap(() => this.inner.listEventsAfter(afterSeq, limit))
  }

  async getMaxEventSeq(): Promise<number> {
    return this.wrap(() => this.inner.getMaxEventSeq())
  }

  async pruneEventsBefore(cutoffIso: string): Promise<number> {
    return this.wrap(() => this.inner.pruneEventsBefore(cutoffIso))
  }

  getDidForMxid(mxid: string): Promise<string | undefined> {
    return this.wrap(() => this.inner.getDidForMxid(mxid))
  }

  // ── Constitution ──

  setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.setConstitution(communityUri, version, rulesJson),
    )
  }

  getConstitution(communityUri: string): Promise<
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined
  > {
    return this.wrap(() => this.inner.getConstitution(communityUri))
  }

  // ── Moderation ──

  insertModerationEvent(event: {
    did: string
    communityUri: string
    eventType: string
    reporterDid?: string | null
    reportReason?: string | null
    reportedEventId?: string | null
    sanctionType?: string | null
    sanctionDurationMinutes?: number | null
    sanctionedByDid?: string | null
    matrixRoomId?: string | null
  }): Promise<void> {
    return this.wrap(() => this.inner.insertModerationEvent(event))
  }

  getModerationEvents(
    did: string,
    communityUri: string,
    sinceDays = 90,
  ): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getModerationEvents(did, communityUri, sinceDays),
    )
  }

  getRecentReportsForCommunity(
    communityUri: string,
    days = 30,
  ): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getRecentReportsForCommunity(communityUri, days),
    )
  }

  purgeReportedMessagePreviews(): Promise<number> {
    return this.wrap(() => this.inner.purgeReportedMessagePreviews())
  }

  getSanctionEvents(did: string, communityUri: string): Promise<any[]> {
    return this.wrap(() => this.inner.getSanctionEvents(did, communityUri))
  }

  getSubjectsWithTimedSanctions(
    sinceDays: number,
  ): Promise<{ did: string; communityUri: string }[]> {
    return this.wrap(() => this.inner.getSubjectsWithTimedSanctions(sinceDays))
  }

  getReportDismissalsForCommunity(
    communityUri: string,
    days = 30,
  ): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getReportDismissalsForCommunity(communityUri, days),
    )
  }

  hasReportFrom(
    reporterDid: string,
    did: string,
    communityUri: string,
    reportedEventId: string | null,
    days: number,
  ): Promise<boolean> {
    return this.wrap(() =>
      this.inner.hasReportFrom(
        reporterDid,
        did,
        communityUri,
        reportedEventId,
        days,
      ),
    )
  }

  // ── Badges ──

  setUserBadge(badge: {
    did: string
    communityUri: string
    badgeType: string
    severity?: string | null
    visibleInChat?: number
    expiresAt?: string | null
  }): Promise<void> {
    return this.wrap(() => this.inner.setUserBadge(badge))
  }

  clearUserBadges(did: string, communityUri: string): Promise<void> {
    return this.wrap(() => this.inner.clearUserBadges(did, communityUri))
  }

  getUserBadges(did: string, communityUri: string): Promise<any[]> {
    return this.wrap(() => this.inner.getUserBadges(did, communityUri))
  }

  getCommunityBadgeSummary(
    communityUri: string,
  ): Promise<{ warning: number; critical: number }> {
    return this.wrap(() => this.inner.getCommunityBadgeSummary(communityUri))
  }

  getMemberList(communityUri: string, limit = 100, offset = 0): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getMemberList(communityUri, limit, offset),
    )
  }

  expireBadges(): Promise<{ did: string; communityUri: string }[]> {
    return this.wrap(() => this.inner.expireBadges())
  }

  // ── Chat Preferences ──

  getChatPreferences(did: string): Promise<{ showChatBadges: boolean }> {
    return this.wrap(() => this.inner.getChatPreferences(did))
  }

  setChatPreferences(did: string, showChatBadges: boolean): Promise<void> {
    return this.wrap(() => this.inner.setChatPreferences(did, showChatBadges))
  }

  upsertDmRequest(
    request: DmRequest,
    now: string,
  ): Promise<{ id: string; expiresAt: string; created: boolean }> {
    return this.wrap(() => this.inner.upsertDmRequest(request, now))
  }

  countPendingDmRequestsFrom(
    requesterDid: string,
    now: string,
  ): Promise<number> {
    return this.wrap(() =>
      this.inner.countPendingDmRequestsFrom(requesterDid, now),
    )
  }

  listDmRequests(
    did: string,
    now: string,
  ): Promise<{ incoming: DmRequestSummary[]; outgoing: DmRequestSummary[] }> {
    return this.wrap(() => this.inner.listDmRequests(did, now))
  }

  takeDmRequest(
    id: string,
    recipientDid: string,
    now: string,
  ): Promise<{ requesterDid: string; requesterMxid: string } | undefined> {
    return this.wrap(() => this.inner.takeDmRequest(id, recipientDid, now))
  }

  deleteDmRequest(id: string, did: string): Promise<boolean> {
    return this.wrap(() => this.inner.deleteDmRequest(id, did))
  }

  purgeExpiredDmRequests(now: string): Promise<number> {
    return this.wrap(() => this.inner.purgeExpiredDmRequests(now))
  }

  // ── Matrix Events ──

  insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content: string
    originServerTs: number
  }): Promise<boolean> {
    return this.wrap(() => this.inner.insertMatrixEvent(event))
  }

  getMatrixPollCursor(roomId: string): Promise<string | undefined> {
    return this.wrap(() => this.inner.getMatrixPollCursor(roomId))
  }

  setMatrixPollCursor(roomId: string, cursor: string): Promise<void> {
    return this.wrap(() => this.inner.setMatrixPollCursor(roomId, cursor))
  }

  eventExists(eventId: string): Promise<boolean> {
    return this.wrap(() => this.inner.eventExists(eventId))
  }

  getEventSender(roomId: string, eventId: string): Promise<string | undefined> {
    return this.wrap(() => this.inner.getEventSender(roomId, eventId))
  }

  getRecentEvents(roomId: string, limit = 100): Promise<any[]> {
    return this.wrap(() => this.inner.getRecentEvents(roomId, limit))
  }

  // ── Read Markers ──

  setReadMarker(did: string, roomId: string, eventId: string): Promise<void> {
    return this.wrap(() => this.inner.setReadMarker(did, roomId, eventId))
  }

  getUnreadCount(did: string, roomId: string): Promise<number> {
    return this.wrap(() => this.inner.getUnreadCount(did, roomId))
  }

  getUnreadCountsForDid(
    did: string,
  ): Promise<
    { roomId: string; communityUri: string; slug: string; unread: number }[]
  > {
    return this.wrap(() => this.inner.getUnreadCountsForDid(did))
  }

  getTotalUnreadForDid(did: string): Promise<number> {
    return this.wrap(() => this.inner.getTotalUnreadForDid(did))
  }

  async recordAsTransaction(txnId: string): Promise<boolean> {
    return this.wrap(() => this.inner.recordAsTransaction(txnId))
  }

  getAllRoomIds(): Promise<string[]> {
    return this.wrap(() => this.inner.getAllRoomIds())
  }

  getActiveCommunityUris(): Promise<string[]> {
    return this.wrap(() => this.inner.getActiveCommunityUris())
  }

  setCommunityMembership(
    did: string,
    communityUri: string,
    membershipState: string,
    roles: string[] = [],
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.setCommunityMembership(
        did,
        communityUri,
        membershipState,
        roles,
      ),
    )
  }

  listCommunityMemberships(
    limit: number,
    offset: number,
  ): Promise<Array<{ did: string; communityUri: string }>> {
    return this.wrap(() => this.inner.listCommunityMemberships(limit, offset))
  }

  async getCommunityMembership(
    did: string,
    communityUri: string,
  ): Promise<{ state: string; roles: string[] } | undefined> {
    return this.wrap(() => this.inner.getCommunityMembership(did, communityUri))
  }

  async getMembershipsForDid(
    did: string,
  ): Promise<Array<{ communityUri: string; state: string; roles: string[] }>> {
    return this.wrap(() => this.inner.getMembershipsForDid(did))
  }

  async upsertCommunityMembershipLease(
    communityUri: string,
    mxid: string,
    verifiedAtIso: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.upsertCommunityMembershipLease(
        communityUri,
        mxid,
        verifiedAtIso,
      ),
    )
  }

  async getExpiredCommunityMembershipLeases(
    cutoffIso: string,
  ): Promise<
    Array<{ communityUri: string; mxid: string; lastVerifiedAt: string }>
  > {
    return this.wrap(() =>
      this.inner.getExpiredCommunityMembershipLeases(cutoffIso),
    )
  }

  async deleteCommunityMembershipLease(
    communityUri: string,
    mxid: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.deleteCommunityMembershipLease(communityUri, mxid),
    )
  }

  isActiveCommunityMember(did: string, communityUri: string): Promise<boolean> {
    return this.wrap(() =>
      this.inner.isActiveCommunityMember(did, communityUri),
    )
  }

  getActiveCommunityRoomsForDid(did: string): Promise<
    Array<{
      roomId: string
      communityUri: string
      slug: string
      kind: 'main' | 'chamber-a' | 'chamber-b' | 'observers'
    }>
  > {
    return this.wrap(() => this.inner.getActiveCommunityRoomsForDid(did))
  }

  getCommunityMembers(
    communityUri: string,
  ): Promise<{ did: string; roles: string[] }[]> {
    return this.wrap(() => this.inner.getCommunityMembers(communityUri))
  }

  close(): Promise<void> {
    return this.wrap(() => this.inner.close())
  }
}
