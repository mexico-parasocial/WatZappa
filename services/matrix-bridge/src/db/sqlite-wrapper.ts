import type { Config } from '../config.js'
import { BridgeDatabase } from '../db.js'
import type {
  CommunitySpaceMap,
  IBridgeDatabase,
  SyncLogEntry,
  UserPushToken,
} from './pg.js'

/**
 * Async wrapper around the synchronous SQLite BridgeDatabase.
 * Implements IBridgeDatabase so it can be used interchangeably with PgBridgeDatabase.
 */
export class SqliteBridgeDatabase implements IBridgeDatabase {
  private inner: BridgeDatabase

  constructor(config: Config) {
    this.inner = new BridgeDatabase(config)
  }

  private wrap<T>(fn: () => T): Promise<T> {
    try {
      return Promise.resolve(fn())
    } catch (err) {
      return Promise.reject(err)
    }
  }

  // ── Community / Space ──

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

  getChamberAssignment(
    communityUri: string,
    did: string,
  ): Promise<string | undefined> {
    return this.wrap(() => this.inner.getChamberAssignment(communityUri, did))
  }

  setChamberAssignment(
    communityUri: string,
    did: string,
    chamber: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.setChamberAssignment(communityUri, did, chamber),
    )
  }

  getChamberMemberCount(
    communityUri: string,
    chamber: string,
  ): Promise<number> {
    return this.wrap(() =>
      this.inner.getChamberMemberCount(communityUri, chamber),
    )
  }

  // ── User Matrix ──

  getMxidForDid(did: string): Promise<string | undefined> {
    return this.wrap(() => this.inner.getMxidForDid(did))
  }

  setMxidForDid(did: string, mxid: string, password: string): Promise<void> {
    return this.wrap(() => this.inner.setMxidForDid(did, mxid, password))
  }

  getUserPassword(did: string): Promise<string | undefined> {
    return this.wrap(() => this.inner.getUserPassword(did))
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

  // ── Proposals ──

  insertProposal(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.insertProposal(
        uri,
        communityUri,
        authorDid,
        title,
        body,
        proposalType,
        budgetRequest,
        createdAt,
      ),
    )
  }

  getProposal(uri: string): Promise<any | undefined> {
    return this.wrap(() => this.inner.getProposal(uri))
  }

  getProposalsByCommunity(
    communityUri: string,
    state?: string,
  ): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getProposalsByCommunity(communityUri, state),
    )
  }

  getProposalsByState(state: string): Promise<any[]> {
    return this.wrap(() => this.inner.getProposalsByState(state))
  }

  updateProposalState(
    uri: string,
    state: string,
    votingStartsAt?: string,
    votingEndsAt?: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.updateProposalState(uri, state, votingStartsAt, votingEndsAt),
    )
  }

  updateProposalVoteCounts(
    uri: string,
    forVotes: number,
    againstVotes: number,
    abstainVotes: number,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.updateProposalVoteCounts(
        uri,
        forVotes,
        againstVotes,
        abstainVotes,
      ),
    )
  }

  finalizeProposal(
    uri: string,
    result: string,
    decidedAt: string,
  ): Promise<void> {
    return this.wrap(() => this.inner.finalizeProposal(uri, result, decidedAt))
  }

  // ── Votes ──

  insertVote(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    weight: number,
    createdAt: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.insertVote(
        uri,
        proposalUri,
        communityUri,
        voterDid,
        choice,
        weight,
        createdAt,
      ),
    )
  }

  getVotesForProposal(proposalUri: string): Promise<any[]> {
    return this.wrap(() => this.inner.getVotesForProposal(proposalUri))
  }

  // ── Decisions ──

  insertDecision(
    proposalUri: string,
    communityUri: string,
    result: string,
    votesFor: number,
    votesAgainst: number,
    votesAbstain: number,
    totalMembers: number | null,
    quorumRequired: number,
    thresholdRequired: number,
    constitutionVersion: number,
    budgetAllocated: number | null,
    createdAt: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.insertDecision(
        proposalUri,
        communityUri,
        result,
        votesFor,
        votesAgainst,
        votesAbstain,
        totalMembers,
        quorumRequired,
        thresholdRequired,
        constitutionVersion,
        budgetAllocated,
        createdAt,
      ),
    )
  }

  getDecision(proposalUri: string): Promise<any | undefined> {
    return this.wrap(() => this.inner.getDecision(proposalUri))
  }

  getDecisionsByCommunity(communityUri: string): Promise<any[]> {
    return this.wrap(() => this.inner.getDecisionsByCommunity(communityUri))
  }

  // ── Sortition ──

  saveSortitionProof(proof: {
    did: string
    communityUri: string
    chamber: 'A' | 'B'
    drandRound: number
    drandRandomness: string
    hashInput: string
    hashOutput: string
    threshold: number
    timestamp: string
  }): Promise<void> {
    return this.wrap(() => this.inner.saveSortitionProof(proof))
  }

  getSortitionProof(
    did: string,
    communityUri: string,
  ): Promise<any | undefined> {
    return this.wrap(() => this.inner.getSortitionProof(did, communityUri))
  }

  getSortitionProofsByCommunity(communityUri: string): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getSortitionProofsByCommunity(communityUri),
    )
  }

  getUnverifiedProofs(limit = 100): Promise<any[]> {
    return this.wrap(() => this.inner.getUnverifiedProofs(limit))
  }

  markProofVerified(id: number): Promise<void> {
    return this.wrap(() => this.inner.markProofVerified(id))
  }

  getSortitionProofCount(): Promise<number> {
    return this.wrap(() => this.inner.getSortitionProofCount())
  }

  // ── Moderation ──

  insertModerationEvent(event: {
    did: string
    communityUri: string
    eventType: string
    severity?: string
    reason?: string
    evidence?: string
    reporterDid?: string
    relatedEventId?: number
    expiresAt?: string
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

  getActiveSanctions(did: string, communityUri: string): Promise<any[]> {
    return this.wrap(() => this.inner.getActiveSanctions(did, communityUri))
  }

  // ── Participation ──

  getParticipationStats(
    did: string,
    communityUri: string,
  ): Promise<any | undefined> {
    return this.wrap(() => this.inner.getParticipationStats(did, communityUri))
  }

  ensureParticipationStats(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.ensureParticipationStats(did, communityUri, matrixRoomId),
    )
  }

  incrementMessageCount(did: string, communityUri: string): Promise<void> {
    return this.wrap(() => this.inner.incrementMessageCount(did, communityUri))
  }

  incrementVoteCount(did: string, communityUri: string): Promise<void> {
    return this.wrap(() => this.inner.incrementVoteCount(did, communityUri))
  }

  incrementProposalCount(did: string, communityUri: string): Promise<void> {
    return this.wrap(() => this.inner.incrementProposalCount(did, communityUri))
  }

  setParticipationRoles(
    did: string,
    communityUri: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.setParticipationRoles(did, communityUri, roles),
    )
  }

  getParticipationStatsByCommunity(communityUri: string): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getParticipationStatsByCommunity(communityUri),
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

  expireBadges(): Promise<void> {
    return this.wrap(() => this.inner.expireBadges())
  }

  // ── Chat Preferences ──

  getChatPreferences(did: string): Promise<{ showChatBadges: boolean }> {
    return this.wrap(() => this.inner.getChatPreferences(did))
  }

  setChatPreferences(did: string, showChatBadges: boolean): Promise<void> {
    return this.wrap(() => this.inner.setChatPreferences(did, showChatBadges))
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

  eventExists(eventId: string): Promise<boolean> {
    return this.wrap(() => this.inner.eventExists(eventId))
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

  getAllRoomIds(): Promise<string[]> {
    return this.wrap(() => this.inner.getAllRoomIds())
  }

  // ── Deliberation Cards ──

  insertCard(card: {
    id: string
    communityUri: string
    authorDid: string
    title: string
    content?: string
    cardType: string
    sourceRoomId?: string
    sourceEventId?: string
    sourceUrl?: string
    isPublic?: number
    passportVisible?: number
    metadata?: string
  }): Promise<void> {
    return this.wrap(() => this.inner.insertCard(card))
  }

  getCardsForCommunity(
    communityUri: string,
    opts?: {
      limit?: number
      offset?: number
      cardType?: string
      authorDid?: string
    },
  ): Promise<any[]> {
    return this.wrap(() => this.inner.getCardsForCommunity(communityUri, opts))
  }

  getCard(id: string): Promise<any | undefined> {
    return this.wrap(() => this.inner.getCard(id))
  }

  getCardCount(communityUri: string): Promise<number> {
    return this.wrap(() => this.inner.getCardCount(communityUri))
  }

  getCardsPendingLLMEnrichment(limit = 10): Promise<any[]> {
    return this.wrap(() => this.inner.getCardsPendingLLMEnrichment(limit))
  }

  markCardEnriched(id: string, model: string): Promise<void> {
    return this.wrap(() => this.inner.markCardEnriched(id, model))
  }

  updateCardVisibility(
    id: string,
    isPublic: number,
    passportVisible: number,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.updateCardVisibility(id, isPublic, passportVisible),
    )
  }

  // ── Card Votes ──

  upsertCardVote(
    cardId: string,
    voterDid: string,
    influence: number,
  ): Promise<void> {
    return this.wrap(() =>
      this.inner.upsertCardVote(cardId, voterDid, influence),
    )
  }

  getCardVote(
    cardId: string,
    voterDid: string,
  ): Promise<{ influence: number } | undefined> {
    return this.wrap(() => this.inner.getCardVote(cardId, voterDid))
  }

  getCardVotes(
    cardId: string,
  ): Promise<Array<{ voter_did: string; influence: number }>> {
    return this.wrap(() => this.inner.getCardVotes(cardId))
  }

  getCardInfluenceScores(cardIds: string[]): Promise<Map<string, number>> {
    return this.wrap(() => this.inner.getCardInfluenceScores(cardIds))
  }

  getCardVoteStats(
    cardIds: string[],
  ): Promise<Map<string, { total: number; count: number }>> {
    return this.wrap(() => this.inner.getCardVoteStats(cardIds))
  }

  // ── Relationships ──

  insertRelationship(rel: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    authorDid: string
  }): Promise<void> {
    return this.wrap(() => this.inner.insertRelationship(rel))
  }

  getRelationshipsForCard(cardId: string): Promise<any[]> {
    return this.wrap(() => this.inner.getRelationshipsForCard(cardId))
  }

  getGraphForCommunity(
    communityUri: string,
  ): Promise<{ nodes: any[]; edges: any[] }> {
    return this.wrap(() => this.inner.getGraphForCommunity(communityUri))
  }

  deleteRelationship(id: string): Promise<void> {
    return this.wrap(() => this.inner.deleteRelationship(id))
  }

  // ── Suggested Relationships ──

  insertSuggestedRelationship(sugg: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    confidence: number
    reason: string
  }): Promise<void> {
    return this.wrap(() => this.inner.insertSuggestedRelationship(sugg))
  }

  getSuggestionsForCommunity(
    communityUri: string,
    opts?: { status?: string; limit?: number },
  ): Promise<any[]> {
    return this.wrap(() =>
      this.inner.getSuggestionsForCommunity(communityUri, opts),
    )
  }

  acceptSuggestion(id: string, authorDid: string): Promise<void> {
    return this.wrap(() => this.inner.acceptSuggestion(id, authorDid))
  }

  rejectSuggestion(id: string): Promise<void> {
    return this.wrap(() => this.inner.rejectSuggestion(id))
  }

  // ── Extracted Entities ──

  insertEntity(entity: {
    cardId: string
    entityType: string
    entityValue: string
    startPos?: number
    endPos?: number
  }): Promise<void> {
    return this.wrap(() => this.inner.insertEntity(entity))
  }

  getEntitiesForCard(cardId: string): Promise<any[]> {
    return this.wrap(() => this.inner.getEntitiesForCard(cardId))
  }

  // ── Community Pulse ──

  getCommunityPulse(
    communityUri: string,
    voterDid?: string,
  ): Promise<{
    stanceDistribution: { pro: number; con: number; neutral: number }
    topEntities: Array<{ value: string; type: string; count: number }>
    trendingClaims: Array<{
      id: string
      title: string
      stance: string
      influence: number
      voteCount: number
      cardType: string
    }>
    controversialClaims: Array<{
      id: string
      title: string
      influence: number
      voteCount: number
      cardType: string
    }>
    userStats?: {
      votesCast: number
      proVotes: number
      conVotes: number
      neutralVotes: number
    }
  }> {
    return this.wrap(() => this.inner.getCommunityPulse(communityUri, voterDid))
  }

  close(): Promise<void> {
    return this.wrap(() => this.inner.close())
  }
}
