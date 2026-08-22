/**
 * Canonical database surface for the bridge. Every consumer type-imports
 * IBridgeDatabase from here; implementations (sqlite, postgres) and the
 * async sqlite wrapper all satisfy it.
 */


export interface CommunitySpaceMap {
  communityUri: string
  spaceId: string
  slug: string
  chamberMode: string
  chamberA_RoomId: string | null
  chamberB_RoomId: string | null
  observerRoomId: string | null
  createdAt: string
}

export interface UserMatrixMap {
  did: string
  matrixUserId: string
  password: string
}

export interface UserPushToken {
  did: string
  expoPushToken: string
  platform: string
  updatedAt: string
}

export interface SyncLogEntry {
  id: number
  eventType: string
  communityUri: string
  did: string | null
  spaceId: string | null
  success: number
  retryCount: number
  error: string | null
  createdAt: string
}

export interface AiConsentRecord {
  did: string
  granted: boolean
  policyVersion: number
  grantedAt: string | null
  revokedAt: string | null
}

export interface IBridgeDatabase {
  getSpaceForCommunity(
    communityUri: string,
  ): Promise<CommunitySpaceMap | undefined>
  setSpaceForCommunity(
    communityUri: string,
    spaceId: string,
    slug: string,
    chamberMode?: string,
  ): Promise<void>
  setChamberRooms(
    communityUri: string,
    chamberA: string | null,
    chamberB: string | null,
    observerRoom: string | null,
  ): Promise<void>
  getChamberAssignment(
    communityUri: string,
    did: string,
  ): Promise<string | undefined>
  setChamberAssignment(
    communityUri: string,
    did: string,
    chamber: string,
  ): Promise<void>
  getChamberMemberCount(communityUri: string, chamber: string): Promise<number>
  getActiveMemberCount(communityUri: string): Promise<number>
  getMxidForDid(did: string): Promise<string | undefined>
  setMxidForDid(did: string, mxid: string, password: string): Promise<void>
  getUserPassword(did: string): Promise<string | undefined>
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
  getCommunityByRoomId(
    roomId: string,
  ): Promise<{ communityUri: string; slug: string } | undefined>
  getDidForMxid(mxid: string): Promise<string | undefined>
  setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): Promise<void>
  getConstitution(communityUri: string): Promise<
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined
  >
  insertProposal(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): Promise<void>
  getProposal(uri: string): Promise<any | undefined>
  getProposalsByCommunity(communityUri: string, state?: string): Promise<any[]>
  getProposalsByState(state: string): Promise<any[]>
  updateProposalState(
    uri: string,
    state: string,
    votingStartsAt?: string,
    votingEndsAt?: string,
  ): Promise<void>
  updateProposalVoteCounts(
    uri: string,
    forVotes: number,
    againstVotes: number,
    abstainVotes: number,
  ): Promise<void>
  finalizeProposal(
    uri: string,
    result: string,
    decidedAt: string,
  ): Promise<void>
  insertVote(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    weight: number,
    createdAt: string,
  ): Promise<void>
  getVotesForProposal(proposalUri: string): Promise<any[]>
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
  ): Promise<void>
  getDecision(proposalUri: string): Promise<any | undefined>
  getDecisionsByCommunity(communityUri: string): Promise<any[]>
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
  }): Promise<void>
  getSortitionProof(did: string, communityUri: string): Promise<any | undefined>
  getSortitionProofsByCommunity(communityUri: string): Promise<any[]>
  getUnverifiedProofs(limit?: number): Promise<any[]>
  markProofVerified(id: number): Promise<void>
  getSortitionProofCount(): Promise<number>
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
  }): Promise<void>
  getModerationEvents(
    did: string,
    communityUri: string,
    sinceDays?: number,
  ): Promise<any[]>
  purgeReportedMessagePreviews(): Promise<number>
  getRecentReportsForCommunity(
    communityUri: string,
    days?: number,
  ): Promise<any[]>
  getActiveSanctions(did: string, communityUri: string): Promise<any[]>
  getParticipationStats(
    did: string,
    communityUri: string,
  ): Promise<any | undefined>
  ensureParticipationStats(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): Promise<void>
  incrementMessageCount(did: string, communityUri: string): Promise<void>
  incrementVoteCount(did: string, communityUri: string): Promise<void>
  incrementProposalCount(did: string, communityUri: string): Promise<void>
  setParticipationRoles(
    did: string,
    communityUri: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): Promise<void>
  getParticipationStatsByCommunity(communityUri: string): Promise<any[]>
  setUserBadge(badge: {
    did: string
    communityUri: string
    badgeType: string
    severity?: string | null
    visibleInChat?: number
    expiresAt?: string | null
  }): Promise<void>
  clearUserBadges(did: string, communityUri: string): Promise<void>
  getUserBadges(did: string, communityUri: string): Promise<any[]>
  getCommunityBadgeSummary(
    communityUri: string,
  ): Promise<{ warning: number; critical: number }>
  getMemberList(
    communityUri: string,
    limit?: number,
    offset?: number,
  ): Promise<any[]>
  expireBadges(): Promise<{ did: string; communityUri: string }[]>
  getChatPreferences(did: string): Promise<{ showChatBadges: boolean }>
  setChatPreferences(did: string, showChatBadges: boolean): Promise<void>
  getAiConsent(did: string): Promise<AiConsentRecord>
  setAiConsent(
    did: string,
    granted: boolean,
    policyVersion: number,
  ): Promise<void>
  /**
   * Subset of `dids` that have live consent at `policyVersion`. Used to filter
   * text before it leaves for a third-party processor; returns an empty set for
   * an empty input rather than querying.
   */
  getConsentingDids(dids: string[], policyVersion: number): Promise<Set<string>>
  insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content: string
    originServerTs: number
  }): Promise<boolean>
  eventExists(eventId: string): Promise<boolean>
  getRecentEvents(roomId: string, limit?: number): Promise<any[]>
  setReadMarker(did: string, roomId: string, eventId: string): Promise<void>
  getUnreadCount(did: string, roomId: string): Promise<number>
  getUnreadCountsForDid(
    did: string,
  ): Promise<
    { roomId: string; communityUri: string; slug: string; unread: number }[]
  >
  getTotalUnreadForDid(did: string): Promise<number>
  getAllRoomIds(): Promise<string[]>
  getActiveCommunityUris(): Promise<string[]>
  setCommunityMembership(
    did: string,
    communityUri: string,
    membershipState: string,
    roles?: string[],
  ): Promise<void>
  isActiveCommunityMember(did: string, communityUri: string): Promise<boolean>
  getActiveCommunityRoomsForDid(did: string): Promise<
    Array<{
      roomId: string
      communityUri: string
      slug: string
      kind: 'main' | 'chamber-a' | 'chamber-b' | 'observers'
    }>
  >
  createSortitionRun(run: {
    id: string
    cabildeoUri: string
    communityUri: string
    createdByDid: string
    assemblySize: number
    eligibilityFilter: string
    drandRound: number
    configRecordJson: string
    createdAt: string
  }): Promise<any>
  getSortitionRun(id: string): Promise<any | undefined>
  getSortitionRunByCabildeo(cabildeoUri: string): Promise<any | undefined>
  getScheduledSortitionRuns(limit?: number): Promise<any[]>
  replaceSortitionCandidates(
    runId: string,
    candidates: Array<{
      did: string
      communityUri: string
      cabildeoUri: string
      hashInput: string
      hashOutput: string
      hashValue: number
      threshold: number
      selected: boolean
      createdAt: string
    }>,
  ): Promise<void>
  activateSortitionRun(run: {
    id: string
    drandRandomness: string
    threshold: number
    eligibleCount: number
    selectedCount: number
    processedAt: string
  }): Promise<any | undefined>
  failSortitionRun(id: string): Promise<void>
  getSortitionCandidates(runId: string, selectedOnly?: boolean): Promise<any[]>
  getSortitionCandidate(runId: string, did: string): Promise<any | undefined>
  insertCommunityMapContribution(contribution: {
    id: string
    communityUri: string
    authorDid: string
    title: string
    content?: string
    sourceUrl?: string
    sourceType: string
    metadata?: string
  }): Promise<void>
  getCommunityMapContributions(
    communityUri: string,
    opts?: { status?: string; viewerDid?: string; limit?: number },
  ): Promise<any[]>
  getCommunityMapContribution(
    id: string,
    viewerDid?: string,
  ): Promise<any | undefined>
  getCommunityContributionVote(
    contributionId: string,
    voterDid: string,
  ): Promise<{ vote: string } | undefined>
  getCommunityContributionVoteCounts(
    contributionId: string,
  ): Promise<{ approve: number; reject: number }>
  voteCommunityMapContribution(
    contributionId: string,
    voterDid: string,
    vote: 'approve' | 'reject',
  ): Promise<any>
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
  }): Promise<void>
  getCardsForCommunity(
    communityUri: string,
    opts?: {
      limit?: number
      offset?: number
      cardType?: string
      authorDid?: string
    },
  ): Promise<any[]>
  getCard(id: string): Promise<any | undefined>
  getCardCount(communityUri: string): Promise<number>
  getCardsPendingLLMEnrichment(limit?: number): Promise<any[]>
  markCardEnriched(id: string, model: string): Promise<void>
  updateCardVisibility(
    id: string,
    isPublic: number,
    passportVisible: number,
  ): Promise<void>
  upsertCardVote(
    cardId: string,
    voterDid: string,
    influence: number,
  ): Promise<void>
  getCardVote(
    cardId: string,
    voterDid: string,
  ): Promise<{ influence: number } | undefined>
  getCardVotes(
    cardId: string,
  ): Promise<Array<{ voter_did: string; influence: number }>>
  getCardInfluenceScores(cardIds: string[]): Promise<Map<string, number>>
  getCardVoteStats(
    cardIds: string[],
  ): Promise<Map<string, { total: number; count: number }>>
  insertRelationship(rel: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    authorDid: string
  }): Promise<void>
  getRelationshipsForCard(cardId: string): Promise<any[]>
  getGraphForCommunity(
    communityUri: string,
  ): Promise<{ nodes: any[]; edges: any[] }>
  deleteRelationship(id: string): Promise<void>
  insertSuggestedRelationship(sugg: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    confidence: number
    reason: string
  }): Promise<void>
  getSuggestionsForCommunity(
    communityUri: string,
    opts?: { status?: string; limit?: number },
  ): Promise<any[]>
  acceptSuggestion(id: string, authorDid: string): Promise<void>
  rejectSuggestion(id: string): Promise<void>
  insertEntity(entity: {
    cardId: string
    entityType: string
    entityValue: string
    startPos?: number
    endPos?: number
  }): Promise<void>
  getEntitiesForCard(cardId: string): Promise<any[]>
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
  }>
  close(): Promise<void>
}
