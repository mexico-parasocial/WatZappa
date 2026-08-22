export interface DeliberationStore {

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
}
