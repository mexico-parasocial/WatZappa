import { randomUUID } from 'node:crypto'
import { Pool, type QueryResult } from 'pg'

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
    reportedMessagePreview?: string | null
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
  expireBadges(): Promise<void>
  getChatPreferences(did: string): Promise<{ showChatBadges: boolean }>
  setChatPreferences(did: string, showChatBadges: boolean): Promise<void>
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

export class PgBridgeDatabase implements IBridgeDatabase {
  private pool: Pool
  private initPromise: Promise<void>

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 20 })
    this.initPromise = this.init()
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS community_space_map (
        community_uri TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        chamber_mode TEXT NOT NULL DEFAULT 'unicameral',
        chamber_a_room_id TEXT,
        chamber_b_room_id TEXT,
        observer_room_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_matrix_map (
        did TEXT PRIMARY KEY,
        matrix_user_id TEXT NOT NULL,
        password TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chamber_assignment (
        community_uri TEXT NOT NULL,
        did TEXT NOT NULL,
        chamber TEXT NOT NULL,
        PRIMARY KEY (community_uri, did)
      );
      CREATE INDEX IF NOT EXISTS idx_chamber_assignment_community ON chamber_assignment(community_uri);

      CREATE TABLE IF NOT EXISTS sync_log (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        did TEXT,
        space_id TEXT,
        success INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sync_log_community ON sync_log(community_uri);
      CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at);

      CREATE TABLE IF NOT EXISTS sync_cursor (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cursor INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_push_tokens (
        did TEXT PRIMARY KEY,
        expo_push_token TEXT NOT NULL,
        platform TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS community_constitutions (
        community_uri TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        rules_json TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS para_proposals (
        uri TEXT PRIMARY KEY,
        community_uri TEXT NOT NULL,
        author_did TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        proposal_type TEXT NOT NULL DEFAULT 'general',
        budget_request REAL,
        state TEXT NOT NULL DEFAULT 'draft',
        voting_starts_at TIMESTAMP WITH TIME ZONE,
        voting_ends_at TIMESTAMP WITH TIME ZONE,
        decided_at TIMESTAMP WITH TIME ZONE,
        result TEXT,
        for_votes INTEGER NOT NULL DEFAULT 0,
        against_votes INTEGER NOT NULL DEFAULT 0,
        abstain_votes INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_proposals_community ON para_proposals(community_uri);
      CREATE INDEX IF NOT EXISTS idx_proposals_state ON para_proposals(state);

      CREATE TABLE IF NOT EXISTS para_votes (
        uri TEXT PRIMARY KEY,
        proposal_uri TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        voter_did TEXT NOT NULL,
        choice TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_votes_proposal ON para_votes(proposal_uri);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_voter_proposal ON para_votes(voter_did, proposal_uri);

      CREATE TABLE IF NOT EXISTS para_decisions (
        id SERIAL PRIMARY KEY,
        proposal_uri TEXT NOT NULL UNIQUE,
        community_uri TEXT NOT NULL,
        result TEXT NOT NULL,
        votes_for INTEGER NOT NULL DEFAULT 0,
        votes_against INTEGER NOT NULL DEFAULT 0,
        votes_abstain INTEGER NOT NULL DEFAULT 0,
        total_members INTEGER,
        quorum_required INTEGER NOT NULL DEFAULT 0,
        threshold_required INTEGER NOT NULL DEFAULT 0,
        constitution_version INTEGER NOT NULL DEFAULT 1,
        budget_allocated REAL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sortition_proofs (
        id SERIAL PRIMARY KEY,
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        chamber TEXT NOT NULL,
        drand_round INTEGER NOT NULL,
        drand_randomness TEXT NOT NULL,
        hash_input TEXT NOT NULL,
        hash_output TEXT NOT NULL,
        threshold INTEGER NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(did, community_uri)
      );
      CREATE INDEX IF NOT EXISTS idx_sortition_did_community ON sortition_proofs(did, community_uri);

      CREATE TABLE IF NOT EXISTS moderation_events (
        id SERIAL PRIMARY KEY,
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT,
        reason TEXT,
        evidence TEXT,
        reporter_did TEXT,
        related_event_id INTEGER,
        expires_at TIMESTAMP WITH TIME ZONE,
        revoked_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_moderation_did ON moderation_events(did);
      CREATE INDEX IF NOT EXISTS idx_moderation_community ON moderation_events(community_uri);
      CREATE INDEX IF NOT EXISTS idx_moderation_type ON moderation_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_moderation_created ON moderation_events(created_at);

      CREATE TABLE IF NOT EXISTS chat_participation_stats (
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        matrix_room_id TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        vote_count INTEGER NOT NULL DEFAULT 0,
        proposal_count INTEGER NOT NULL DEFAULT 0,
        is_delegate INTEGER NOT NULL DEFAULT 0,
        is_moderator INTEGER NOT NULL DEFAULT 0,
        chamber TEXT,
        first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_active TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (did, community_uri)
      );
      CREATE INDEX IF NOT EXISTS idx_participation_community ON chat_participation_stats(community_uri);

      CREATE TABLE IF NOT EXISTS user_badges (
        id SERIAL PRIMARY KEY,
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        severity TEXT,
        visible_in_chat INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(did, community_uri, badge_type)
      );
      CREATE INDEX IF NOT EXISTS idx_badges_did_community ON user_badges(did, community_uri);
      CREATE INDEX IF NOT EXISTS idx_badges_expires ON user_badges(expires_at);

      CREATE TABLE IF NOT EXISTS chat_preferences (
        did TEXT PRIMARY KEY,
        show_chat_badges INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS matrix_events (
        id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        sender TEXT NOT NULL,
        event_type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        processed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_matrix_events_room ON matrix_events(room_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_matrix_events_event_id ON matrix_events(event_id);

      CREATE TABLE IF NOT EXISTS room_read_markers (
        did TEXT NOT NULL,
        room_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (did, room_id)
      );

      CREATE TABLE IF NOT EXISTS deliberation_cards (
        id TEXT PRIMARY KEY,
        community_uri TEXT NOT NULL,
        author_did TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        card_type TEXT NOT NULL DEFAULT 'claim',
        source_room_id TEXT,
        source_event_id TEXT,
        source_url TEXT,
        extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        is_public INTEGER NOT NULL DEFAULT 1,
        passport_visible INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        llm_enriched_at TIMESTAMP WITH TIME ZONE,
        llm_model TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cards_community ON deliberation_cards(community_uri);
      CREATE INDEX IF NOT EXISTS idx_cards_author ON deliberation_cards(author_did);
      CREATE INDEX IF NOT EXISTS idx_cards_type ON deliberation_cards(card_type);
      CREATE INDEX IF NOT EXISTS idx_cards_enriched ON deliberation_cards(llm_enriched_at);

      CREATE TABLE IF NOT EXISTS deliberation_relationships (
        id TEXT PRIMARY KEY,
        source_card_id TEXT NOT NULL,
        target_card_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        author_did TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(source_card_id, target_card_id, relationship_type, author_did)
      );
      CREATE INDEX IF NOT EXISTS idx_rel_source ON deliberation_relationships(source_card_id);
      CREATE INDEX IF NOT EXISTS idx_rel_target ON deliberation_relationships(target_card_id);
      CREATE INDEX IF NOT EXISTS idx_rel_type ON deliberation_relationships(relationship_type);

      CREATE TABLE IF NOT EXISTS suggested_relationships (
        id TEXT PRIMARY KEY,
        source_card_id TEXT NOT NULL,
        target_card_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(source_card_id, target_card_id, relationship_type)
      );
      CREATE INDEX IF NOT EXISTS idx_suggestions_source ON suggested_relationships(source_card_id);
      CREATE INDEX IF NOT EXISTS idx_suggestions_target ON suggested_relationships(target_card_id);
      CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggested_relationships(status);

      CREATE TABLE IF NOT EXISTS card_votes (
        id SERIAL PRIMARY KEY,
        card_id TEXT NOT NULL,
        voter_did TEXT NOT NULL,
        influence INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(card_id, voter_did)
      );
      CREATE INDEX IF NOT EXISTS idx_votes_card ON card_votes(card_id);
      CREATE INDEX IF NOT EXISTS idx_votes_voter ON card_votes(voter_did);

      CREATE TABLE IF NOT EXISTS extracted_entities (
        id SERIAL PRIMARY KEY,
        card_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_value TEXT NOT NULL,
        start_pos INTEGER,
        end_pos INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_entities_card ON extracted_entities(card_id);
      CREATE INDEX IF NOT EXISTS idx_entities_type_value ON extracted_entities(entity_type, entity_value);
    `)
  }

  private async query(text: string, params?: any[]): Promise<QueryResult> {
    await this.initPromise
    return this.pool.query(text, params)
  }

  private async queryOne<T = any>(
    text: string,
    params?: any[],
  ): Promise<T | undefined> {
    const result = await this.query(text, params)
    return result.rows[0] as T | undefined
  }

  private async queryAll<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await this.query(text, params)
    return result.rows as T[]
  }

  private async run(text: string, params?: any[]): Promise<void> {
    await this.query(text, params)
  }

  // Community <-> Space mappings
  async getSpaceForCommunity(
    communityUri: string,
  ): Promise<CommunitySpaceMap | undefined> {
    return this.queryOne<CommunitySpaceMap>(
      'SELECT * FROM community_space_map WHERE community_uri = $1',
      [communityUri],
    )
  }

  async setSpaceForCommunity(
    communityUri: string,
    spaceId: string,
    slug: string,
    chamberMode = 'unicameral',
  ): Promise<void> {
    await this.run(
      `INSERT INTO community_space_map (community_uri, space_id, slug, chamber_mode, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (community_uri) DO UPDATE SET
         space_id = EXCLUDED.space_id,
         slug = EXCLUDED.slug,
         chamber_mode = EXCLUDED.chamber_mode,
         created_at = EXCLUDED.created_at`,
      [communityUri, spaceId, slug, chamberMode],
    )
  }

  async setChamberRooms(
    communityUri: string,
    chamberA: string | null,
    chamberB: string | null,
    observerRoom: string | null,
  ): Promise<void> {
    await this.run(
      'UPDATE community_space_map SET chamber_a_room_id = $1, chamber_b_room_id = $2, observer_room_id = $3 WHERE community_uri = $4',
      [chamberA, chamberB, observerRoom, communityUri],
    )
  }

  // Chamber assignments
  async getChamberAssignment(
    communityUri: string,
    did: string,
  ): Promise<string | undefined> {
    const row = await this.queryOne<{ chamber: string }>(
      'SELECT chamber FROM chamber_assignment WHERE community_uri = $1 AND did = $2',
      [communityUri, did],
    )
    return row?.chamber
  }

  async setChamberAssignment(
    communityUri: string,
    did: string,
    chamber: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO chamber_assignment (community_uri, did, chamber) VALUES ($1, $2, $3)
       ON CONFLICT (community_uri, did) DO UPDATE SET chamber = EXCLUDED.chamber`,
      [communityUri, did, chamber],
    )
  }

  async getChamberMemberCount(
    communityUri: string,
    chamber: string,
  ): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM chamber_assignment WHERE community_uri = $1 AND chamber = $2',
      [communityUri, chamber],
    )
    return row?.count ?? 0
  }

  // User <-> MXID mappings
  async getMxidForDid(did: string): Promise<string | undefined> {
    const row = await this.queryOne<{ matrix_user_id: string }>(
      'SELECT matrix_user_id FROM user_matrix_map WHERE did = $1',
      [did],
    )
    return row?.matrix_user_id
  }

  async setMxidForDid(
    did: string,
    mxid: string,
    password: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO user_matrix_map (did, matrix_user_id, password) VALUES ($1, $2, $3)
       ON CONFLICT (did) DO UPDATE SET matrix_user_id = EXCLUDED.matrix_user_id, password = EXCLUDED.password`,
      [did, mxid, password],
    )
  }

  async getUserPassword(did: string): Promise<string | undefined> {
    const row = await this.queryOne<{ password: string }>(
      'SELECT password FROM user_matrix_map WHERE did = $1',
      [did],
    )
    return row?.password
  }

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

  // Lookup community by any of its room IDs
  async getCommunityByRoomId(
    roomId: string,
  ): Promise<{ communityUri: string; slug: string } | undefined> {
    const row = await this.queryOne<{ community_uri: string; slug: string }>(
      'SELECT community_uri, slug FROM community_space_map WHERE chamber_a_room_id = $1 OR chamber_b_room_id = $1 OR observer_room_id = $1',
      [roomId],
    )
    return row ? { communityUri: row.community_uri, slug: row.slug } : undefined
  }

  // Get DID by MXID
  async getDidForMxid(mxid: string): Promise<string | undefined> {
    const row = await this.queryOne<{ did: string }>(
      'SELECT did FROM user_matrix_map WHERE matrix_user_id = $1',
      [mxid],
    )
    return row?.did
  }

  // Constitutions
  async setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO community_constitutions (community_uri, version, rules_json, created_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (community_uri) DO UPDATE SET version = EXCLUDED.version, rules_json = EXCLUDED.rules_json, created_at = EXCLUDED.created_at`,
      [communityUri, version, rulesJson],
    )
  }

  async getConstitution(communityUri: string): Promise<
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined
  > {
    const row = await this.queryOne<{
      community_uri: string
      version: number
      rules_json: string
      created_at: string
    }>('SELECT * FROM community_constitutions WHERE community_uri = $1', [
      communityUri,
    ])
    return row
      ? {
          communityUri: row.community_uri,
          version: row.version,
          rulesJson: row.rules_json,
          createdAt: row.created_at,
        }
      : undefined
  }

  // Proposals
  async insertProposal(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): Promise<void> {
    await this.run(
      'INSERT INTO para_proposals (uri, community_uri, author_did, title, body, proposal_type, budget_request, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        uri,
        communityUri,
        authorDid,
        title,
        body,
        proposalType,
        budgetRequest,
        createdAt,
      ],
    )
  }

  async getProposal(uri: string): Promise<any | undefined> {
    return this.queryOne('SELECT * FROM para_proposals WHERE uri = $1', [uri])
  }

  async getProposalsByCommunity(
    communityUri: string,
    state?: string,
  ): Promise<any[]> {
    if (state) {
      return this.queryAll(
        'SELECT * FROM para_proposals WHERE community_uri = $1 AND state = $2 ORDER BY created_at ASC',
        [communityUri, state],
      )
    }
    return this.queryAll(
      'SELECT * FROM para_proposals WHERE community_uri = $1 ORDER BY created_at ASC',
      [communityUri],
    )
  }

  async getProposalsByState(state: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM para_proposals WHERE state = $1 ORDER BY created_at ASC',
      [state],
    )
  }

  async updateProposalState(
    uri: string,
    state: string,
    votingStartsAt?: string,
    votingEndsAt?: string,
  ): Promise<void> {
    await this.run(
      'UPDATE para_proposals SET state = $1, voting_starts_at = $2, voting_ends_at = $3 WHERE uri = $4',
      [state, votingStartsAt ?? null, votingEndsAt ?? null, uri],
    )
  }

  async updateProposalVoteCounts(
    uri: string,
    forVotes: number,
    againstVotes: number,
    abstainVotes: number,
  ): Promise<void> {
    await this.run(
      'UPDATE para_proposals SET for_votes = $1, against_votes = $2, abstain_votes = $3 WHERE uri = $4',
      [forVotes, againstVotes, abstainVotes, uri],
    )
  }

  async finalizeProposal(
    uri: string,
    result: string,
    decidedAt: string,
  ): Promise<void> {
    await this.run(
      'UPDATE para_proposals SET state = $1, result = $1, decided_at = $2 WHERE uri = $3',
      [result, decidedAt, uri],
    )
  }

  // Votes
  async insertVote(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    weight: number,
    createdAt: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO para_votes (uri, proposal_uri, community_uri, voter_did, choice, weight, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (uri) DO UPDATE SET proposal_uri = EXCLUDED.proposal_uri, community_uri = EXCLUDED.community_uri, voter_did = EXCLUDED.voter_did, choice = EXCLUDED.choice, weight = EXCLUDED.weight, created_at = EXCLUDED.created_at`,
      [uri, proposalUri, communityUri, voterDid, choice, weight, createdAt],
    )
  }

  async getVotesForProposal(proposalUri: string): Promise<any[]> {
    return this.queryAll('SELECT * FROM para_votes WHERE proposal_uri = $1', [
      proposalUri,
    ])
  }

  // Decisions
  async insertDecision(
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
    await this.run(
      'INSERT INTO para_decisions (proposal_uri, community_uri, result, votes_for, votes_against, votes_abstain, total_members, quorum_required, threshold_required, constitution_version, budget_allocated, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [
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
      ],
    )
  }

  async getDecision(proposalUri: string): Promise<any | undefined> {
    return this.queryOne(
      'SELECT * FROM para_decisions WHERE proposal_uri = $1',
      [proposalUri],
    )
  }

  async getDecisionsByCommunity(communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM para_decisions WHERE community_uri = $1 ORDER BY created_at DESC',
      [communityUri],
    )
  }

  // Sortition proofs
  async saveSortitionProof(proof: {
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
    await this.run(
      `INSERT INTO sortition_proofs (did, community_uri, chamber, drand_round, drand_randomness, hash_input, hash_output, threshold, timestamp, verified) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
       ON CONFLICT (did, community_uri) DO UPDATE SET chamber = EXCLUDED.chamber, drand_round = EXCLUDED.drand_round, drand_randomness = EXCLUDED.drand_randomness, hash_input = EXCLUDED.hash_input, hash_output = EXCLUDED.hash_output, threshold = EXCLUDED.threshold, timestamp = EXCLUDED.timestamp, verified = 1`,
      [
        proof.did,
        proof.communityUri,
        proof.chamber,
        proof.drandRound,
        proof.drandRandomness,
        proof.hashInput,
        proof.hashOutput,
        proof.threshold,
        proof.timestamp,
      ],
    )
  }

  async getSortitionProof(
    did: string,
    communityUri: string,
  ): Promise<any | undefined> {
    return this.queryOne(
      'SELECT * FROM sortition_proofs WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async getSortitionProofsByCommunity(communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM sortition_proofs WHERE community_uri = $1 ORDER BY timestamp DESC',
      [communityUri],
    )
  }

  async getUnverifiedProofs(limit = 100): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM sortition_proofs WHERE verified = 0 ORDER BY timestamp DESC LIMIT $1',
      [limit],
    )
  }

  async markProofVerified(id: number): Promise<void> {
    await this.run('UPDATE sortition_proofs SET verified = 1 WHERE id = $1', [
      id,
    ])
  }

  async getSortitionProofCount(): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM sortition_proofs',
    )
    return row?.count ?? 0
  }

  // Chat moderation events
  async insertModerationEvent(event: {
    did: string
    communityUri: string
    eventType: string
    reporterDid?: string | null
    reportReason?: string | null
    reportedEventId?: string | null
    reportedMessagePreview?: string | null
    sanctionType?: string | null
    sanctionDurationMinutes?: number | null
    sanctionedByDid?: string | null
    matrixRoomId?: string | null
  }): Promise<void> {
    const relatedEventId = event.reportedEventId
      ? parseInt(event.reportedEventId, 10) || null
      : null
    await this.run(
      'INSERT INTO moderation_events (did, community_uri, event_type, severity, reason, evidence, reporter_did, related_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        event.did,
        event.communityUri,
        event.eventType,
        event.sanctionType ?? null,
        event.reportReason ?? null,
        event.reportedMessagePreview ?? null,
        event.reporterDid ?? null,
        relatedEventId,
      ],
    )
  }

  async getModerationEvents(
    did: string,
    communityUri: string,
    sinceDays = 90,
  ): Promise<any[]> {
    return this.queryAll(
      "SELECT * FROM moderation_events WHERE did = $1 AND community_uri = $2 AND created_at >= NOW() - INTERVAL '1 day' * $3 ORDER BY created_at DESC",
      [did, communityUri, sinceDays],
    )
  }

  async getRecentReportsForCommunity(
    communityUri: string,
    days = 30,
  ): Promise<any[]> {
    return this.queryAll(
      "SELECT * FROM moderation_events WHERE community_uri = $1 AND event_type = 'report_received' AND created_at >= NOW() - INTERVAL '1 day' * $2 ORDER BY created_at DESC",
      [communityUri, days],
    )
  }

  async getActiveSanctions(did: string, communityUri: string): Promise<any[]> {
    return this.queryAll(
      "SELECT * FROM moderation_events WHERE did = $1 AND community_uri = $2 AND event_type IN ('mute','ban') AND created_at >= NOW() - INTERVAL '90 days' ORDER BY created_at DESC",
      [did, communityUri],
    )
  }

  // Chat participation stats
  async getParticipationStats(
    did: string,
    communityUri: string,
  ): Promise<any | undefined> {
    return this.queryOne(
      'SELECT * FROM chat_participation_stats WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async ensureParticipationStats(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): Promise<void> {
    await this.run(
      'INSERT INTO chat_participation_stats (did, community_uri, matrix_room_id, first_seen) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
      [did, communityUri, matrixRoomId ?? null],
    )
  }

  async incrementMessageCount(
    did: string,
    communityUri: string,
  ): Promise<void> {
    await this.run(
      'UPDATE chat_participation_stats SET message_count = message_count + 1, last_active = NOW() WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async incrementVoteCount(did: string, communityUri: string): Promise<void> {
    await this.run(
      'UPDATE chat_participation_stats SET vote_count = vote_count + 1, last_active = NOW() WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async incrementProposalCount(
    did: string,
    communityUri: string,
  ): Promise<void> {
    await this.run(
      'UPDATE chat_participation_stats SET proposal_count = proposal_count + 1, last_active = NOW() WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async setParticipationRoles(
    did: string,
    communityUri: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): Promise<void> {
    const parts: string[] = []
    const values: (string | number | null)[] = []
    let idx = 1
    if (roles.isDelegate !== undefined) {
      parts.push(`is_delegate = $${idx++}`)
      values.push(roles.isDelegate ? 1 : 0)
    }
    if (roles.isModerator !== undefined) {
      parts.push(`is_moderator = $${idx++}`)
      values.push(roles.isModerator ? 1 : 0)
    }
    if (roles.chamber !== undefined) {
      parts.push(`chamber = $${idx++}`)
      values.push(roles.chamber)
    }
    if (parts.length === 0) return
    values.push(did, communityUri)
    await this.run(
      `UPDATE chat_participation_stats SET ${parts.join(', ')}, last_active = NOW() WHERE did = $${idx++} AND community_uri = $${idx++}`,
      values,
    )
  }

  async getParticipationStatsByCommunity(communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM chat_participation_stats WHERE community_uri = $1 ORDER BY message_count DESC',
      [communityUri],
    )
  }

  // Chat user badges
  async setUserBadge(badge: {
    did: string
    communityUri: string
    badgeType: string
    severity?: string | null
    visibleInChat?: number
    expiresAt?: string | null
  }): Promise<void> {
    await this.run(
      'DELETE FROM user_badges WHERE did = $1 AND community_uri = $2 AND badge_type = $3',
      [badge.did, badge.communityUri, badge.badgeType],
    )
    await this.run(
      'INSERT INTO user_badges (did, community_uri, badge_type, severity, visible_in_chat, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [
        badge.did,
        badge.communityUri,
        badge.badgeType,
        badge.severity ?? null,
        badge.visibleInChat ?? 1,
        badge.expiresAt ?? null,
      ],
    )
  }

  async clearUserBadges(did: string, communityUri: string): Promise<void> {
    await this.run(
      'DELETE FROM user_badges WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async getUserBadges(did: string, communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM user_badges WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
  }

  async getCommunityBadgeSummary(
    communityUri: string,
  ): Promise<{ warning: number; critical: number }> {
    const row = await this.queryOne<{ warning: number; critical: number }>(
      "SELECT COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warning, COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical FROM user_badges WHERE community_uri = $1 AND visible_in_chat = 1 AND (expires_at IS NULL OR expires_at > NOW())",
      [communityUri],
    )
    return row ?? { warning: 0, critical: 0 }
  }

  async getMemberList(
    communityUri: string,
    limit = 100,
    offset = 0,
  ): Promise<any[]> {
    return this.queryAll(
      'SELECT ps.*, umm.matrix_user_id FROM chat_participation_stats ps LEFT JOIN user_matrix_map umm ON ps.did = umm.did WHERE ps.community_uri = $1 ORDER BY ps.last_active DESC LIMIT $2 OFFSET $3',
      [communityUri, limit, offset],
    )
  }

  async expireBadges(): Promise<void> {
    await this.run(
      'DELETE FROM user_badges WHERE expires_at IS NOT NULL AND expires_at <= NOW()',
    )
  }

  // User chat preferences
  async getChatPreferences(did: string): Promise<{ showChatBadges: boolean }> {
    const row = await this.queryOne<{ show_chat_badges: number }>(
      'SELECT show_chat_badges FROM chat_preferences WHERE did = $1',
      [did],
    )
    return { showChatBadges: row ? row.show_chat_badges === 1 : false }
  }

  async setChatPreferences(
    did: string,
    showChatBadges: boolean,
  ): Promise<void> {
    await this.run(
      `INSERT INTO chat_preferences (did, show_chat_badges, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (did) DO UPDATE SET show_chat_badges = EXCLUDED.show_chat_badges, updated_at = NOW()`,
      [did, showChatBadges ? 1 : 0],
    )
  }

  // Matrix event ingestion
  async insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content: string
    originServerTs: number
  }): Promise<boolean> {
    try {
      await this.run(
        'INSERT INTO matrix_events (room_id, event_id, sender, event_type, content, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          event.roomId,
          event.eventId,
          event.sender,
          event.type,
          event.content,
          event.originServerTs,
        ],
      )
      return true
    } catch (err: any) {
      if (err.code === '23505') {
        return false
      }
      throw err
    }
  }

  async eventExists(eventId: string): Promise<boolean> {
    const row = await this.queryOne(
      'SELECT 1 FROM matrix_events WHERE event_id = $1',
      [eventId],
    )
    return !!row
  }

  async getRecentEvents(roomId: string, limit = 100): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM matrix_events WHERE room_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [roomId, limit],
    )
  }

  // Read markers & unread counts
  async setReadMarker(
    did: string,
    roomId: string,
    eventId: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO room_read_markers (did, room_id, event_id, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (did, room_id) DO UPDATE SET event_id = EXCLUDED.event_id, updated_at = NOW()`,
      [did, roomId, eventId],
    )
  }

  async getUnreadCount(did: string, roomId: string): Promise<number> {
    const marker = await this.queryOne<{ event_id: string }>(
      'SELECT event_id FROM room_read_markers WHERE did = $1 AND room_id = $2',
      [did, roomId],
    )

    if (!marker?.event_id) {
      const row = await this.queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM matrix_events WHERE room_id = $1 AND timestamp > $2 AND event_type = 'm.room.message'",
        [roomId, Date.now() - 7 * 24 * 60 * 60 * 1000],
      )
      return Math.min(row?.count ?? 0, 99)
    }

    const row = await this.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM matrix_events me
        WHERE me.room_id = $1 AND me.event_type = 'm.room.message'
        AND me.timestamp > (
          SELECT timestamp FROM matrix_events WHERE event_id = $2
        )`,
      [roomId, marker.event_id],
    )
    return row?.count ?? 0
  }

  async getUnreadCountsForDid(
    did: string,
  ): Promise<
    { roomId: string; communityUri: string; slug: string; unread: number }[]
  > {
    const rooms = await this.queryAll<{
      room_id: string
      community_uri: string
      slug: string
    }>(
      'SELECT space_id as room_id, community_uri, slug FROM community_space_map WHERE space_id IS NOT NULL',
    )

    return Promise.all(
      rooms.map(async (r) => ({
        roomId: r.room_id,
        communityUri: r.community_uri,
        slug: r.slug,
        unread: await this.getUnreadCount(did, r.room_id),
      })),
    )
  }

  async getTotalUnreadForDid(did: string): Promise<number> {
    const counts = await this.getUnreadCountsForDid(did)
    return counts.reduce((sum, c) => sum + c.unread, 0)
  }

  // Get all tracked room IDs
  async getAllRoomIds(): Promise<string[]> {
    const rows = await this.queryAll<{ space_id: string }>(
      'SELECT space_id FROM community_space_map WHERE space_id IS NOT NULL',
    )
    return rows.map((r) => r.space_id)
  }

  // ── Deliberation Cards ──

  async insertCard(card: {
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
    await this.run(
      'INSERT INTO deliberation_cards (id, community_uri, author_did, title, content, card_type, source_room_id, source_event_id, source_url, is_public, passport_visible, metadata, extracted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())',
      [
        card.id,
        card.communityUri,
        card.authorDid,
        card.title,
        card.content ?? null,
        card.cardType,
        card.sourceRoomId ?? null,
        card.sourceEventId ?? null,
        card.sourceUrl ?? null,
        card.isPublic ?? 0,
        card.passportVisible ?? 0,
        card.metadata ?? null,
      ],
    )
  }

  async getCardsForCommunity(
    communityUri: string,
    opts: {
      limit?: number
      offset?: number
      cardType?: string
      authorDid?: string
    } = {},
  ): Promise<any[]> {
    let sql = 'SELECT * FROM deliberation_cards WHERE community_uri = $1'
    const params: (string | number)[] = [communityUri]
    let idx = 2
    if (opts.cardType) {
      sql += ` AND card_type = $${idx++}`
      params.push(opts.cardType)
    }
    if (opts.authorDid) {
      sql += ` AND author_did = $${idx++}`
      params.push(opts.authorDid)
    }
    sql += ' ORDER BY extracted_at DESC'
    if (opts.limit) {
      sql += ` LIMIT $${idx++}`
      params.push(opts.limit)
    }
    if (opts.offset) {
      sql += ` OFFSET $${idx++}`
      params.push(opts.offset)
    }
    return this.queryAll(sql, params)
  }

  async getCard(id: string): Promise<any | undefined> {
    return this.queryOne('SELECT * FROM deliberation_cards WHERE id = $1', [id])
  }

  async getCardCount(communityUri: string): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM deliberation_cards WHERE community_uri = $1',
      [communityUri],
    )
    return row?.count ?? 0
  }

  async getCardsPendingLLMEnrichment(limit = 10): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM deliberation_cards WHERE llm_enriched_at IS NULL ORDER BY extracted_at DESC LIMIT $1',
      [limit],
    )
  }

  async markCardEnriched(id: string, model: string): Promise<void> {
    await this.run(
      'UPDATE deliberation_cards SET llm_enriched_at = NOW(), llm_model = $1 WHERE id = $2',
      [model, id],
    )
  }

  async updateCardVisibility(
    id: string,
    isPublic: number,
    passportVisible: number,
  ): Promise<void> {
    await this.run(
      'UPDATE deliberation_cards SET is_public = $1, passport_visible = $2 WHERE id = $3',
      [isPublic, passportVisible, id],
    )
  }

  // ── Card Votes (Influence) ──

  async upsertCardVote(
    cardId: string,
    voterDid: string,
    influence: number,
  ): Promise<void> {
    await this.run(
      `INSERT INTO card_votes (card_id, voter_did, influence, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (card_id, voter_did) DO UPDATE SET
         influence = EXCLUDED.influence,
         updated_at = NOW()`,
      [cardId, voterDid, influence],
    )
  }

  async getCardVote(
    cardId: string,
    voterDid: string,
  ): Promise<{ influence: number } | undefined> {
    return this.queryOne<{ influence: number }>(
      'SELECT influence FROM card_votes WHERE card_id = $1 AND voter_did = $2',
      [cardId, voterDid],
    )
  }

  async getCardVotes(
    cardId: string,
  ): Promise<Array<{ voter_did: string; influence: number }>> {
    return this.queryAll<{ voter_did: string; influence: number }>(
      'SELECT voter_did, influence FROM card_votes WHERE card_id = $1',
      [cardId],
    )
  }

  async getCardInfluenceScores(
    cardIds: string[],
  ): Promise<Map<string, number>> {
    if (cardIds.length === 0) return new Map()
    const rows = await this.queryAll<{ card_id: string; total: number }>(
      'SELECT card_id, SUM(influence) as total FROM card_votes WHERE card_id = ANY($1) GROUP BY card_id',
      [cardIds],
    )
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.card_id, row.total)
    }
    return map
  }

  async getCardVoteStats(
    cardIds: string[],
  ): Promise<Map<string, { total: number; count: number }>> {
    if (cardIds.length === 0) return new Map()
    const rows = await this.queryAll<{
      card_id: string
      total: number
      count: number
    }>(
      'SELECT card_id, SUM(influence) as total, COUNT(*) as count FROM card_votes WHERE card_id = ANY($1) GROUP BY card_id',
      [cardIds],
    )
    const map = new Map<string, { total: number; count: number }>()
    for (const row of rows) {
      map.set(row.card_id, { total: row.total, count: row.count })
    }
    return map
  }

  // ── Relationships ──

  async insertRelationship(rel: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    authorDid: string
  }): Promise<void> {
    await this.run(
      'INSERT INTO deliberation_relationships (id, source_card_id, target_card_id, relationship_type, author_did) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [
        rel.id,
        rel.sourceCardId,
        rel.targetCardId,
        rel.relationshipType,
        rel.authorDid,
      ],
    )
  }

  async getRelationshipsForCard(cardId: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM deliberation_relationships WHERE source_card_id = $1 OR target_card_id = $1',
      [cardId],
    )
  }

  async getGraphForCommunity(
    communityUri: string,
  ): Promise<{ nodes: any[]; edges: any[] }> {
    const nodes = await this.queryAll<any>(
      'SELECT * FROM deliberation_cards WHERE community_uri = $1',
      [communityUri],
    )
    const cardIds = nodes.map((n: any) => n.id)
    if (cardIds.length === 0) return { nodes: [], edges: [] }
    const edges = await this.queryAll<any>(
      'SELECT * FROM deliberation_relationships WHERE source_card_id = ANY($1) OR target_card_id = ANY($1)',
      [cardIds],
    )
    const voteStats = await this.getCardVoteStats(cardIds)
    for (const node of nodes) {
      const stats = voteStats.get(node.id)
      node.influence = stats?.total ?? 0
      node.vote_count = stats?.count ?? 0
      node.stance =
        node.influence > 0 ? 'pro' : node.influence < 0 ? 'con' : 'neutral'
    }
    return { nodes, edges }
  }

  async deleteRelationship(id: string): Promise<void> {
    await this.run('DELETE FROM deliberation_relationships WHERE id = $1', [id])
  }

  // ── Suggested Relationships ──

  async insertSuggestedRelationship(sugg: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    confidence: number
    reason: string
  }): Promise<void> {
    await this.run(
      'INSERT INTO suggested_relationships (id, source_card_id, target_card_id, relationship_type, confidence, reason) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
      [
        sugg.id,
        sugg.sourceCardId,
        sugg.targetCardId,
        sugg.relationshipType,
        sugg.confidence,
        sugg.reason,
      ],
    )
  }

  async getSuggestionsForCommunity(
    communityUri: string,
    opts: { status?: string; limit?: number } = {},
  ): Promise<any[]> {
    let sql = `SELECT sr.*, sc.title as source_title, sc.card_type as source_type, tc.title as target_title, tc.card_type as target_type
      FROM suggested_relationships sr
      JOIN deliberation_cards sc ON sr.source_card_id = sc.id
      JOIN deliberation_cards tc ON sr.target_card_id = tc.id
      WHERE sc.community_uri = $1`
    const params: (string | number)[] = [communityUri]
    let idx = 2
    if (opts.status) {
      sql += ` AND sr.status = $${idx++}`
      params.push(opts.status)
    }
    sql += ' ORDER BY sr.confidence DESC'
    if (opts.limit) {
      sql += ` LIMIT $${idx++}`
      params.push(opts.limit)
    }
    return this.queryAll(sql, params)
  }

  async acceptSuggestion(id: string, authorDid: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const suggResult = await client.query<{
        source_card_id: string
        target_card_id: string
        relationship_type: string
      }>('SELECT * FROM suggested_relationships WHERE id = $1', [id])
      const sugg = suggResult.rows[0]
      if (!sugg) {
        await client.query('ROLLBACK')
        client.release()
        return
      }
      await client.query(
        'UPDATE suggested_relationships SET status = $1 WHERE id = $2',
        ['accepted', id],
      )
      await client.query(
        'INSERT INTO deliberation_relationships (id, source_card_id, target_card_id, relationship_type, author_did) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [
          randomUUID(),
          sugg.source_card_id,
          sugg.target_card_id,
          sugg.relationship_type,
          authorDid,
        ],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async rejectSuggestion(id: string): Promise<void> {
    await this.run(
      'UPDATE suggested_relationships SET status = $1 WHERE id = $2',
      ['rejected', id],
    )
  }

  // ── Extracted Entities ──

  async insertEntity(entity: {
    cardId: string
    entityType: string
    entityValue: string
    startPos?: number
    endPos?: number
  }): Promise<void> {
    await this.run(
      'INSERT INTO extracted_entities (card_id, entity_type, entity_value, start_pos, end_pos) VALUES ($1, $2, $3, $4, $5)',
      [
        entity.cardId,
        entity.entityType,
        entity.entityValue,
        entity.startPos ?? null,
        entity.endPos ?? null,
      ],
    )
  }

  async getEntitiesForCard(cardId: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM extracted_entities WHERE card_id = $1',
      [cardId],
    )
  }

  // ── Community Pulse (Discourse Analysis) ──

  async getCommunityPulse(
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
    const cards = await this.queryAll<{
      id: string
      title: string
      card_type: string
      influence: number
      vote_count: number
    }>(
      `
      SELECT c.id, c.title, c.card_type,
        COALESCE(SUM(v.influence), 0) as influence,
        COUNT(v.id) as vote_count
      FROM deliberation_cards c
      LEFT JOIN card_votes v ON c.id = v.card_id
      WHERE c.community_uri = $1
      GROUP BY c.id
    `,
      [communityUri],
    )

    let pro = 0,
      con = 0,
      neutral = 0
    for (const card of cards) {
      if (card.influence > 0) pro++
      else if (card.influence < 0) con++
      else neutral++
    }

    const entities = await this.queryAll<{
      value: string
      type: string
      count: number
    }>(
      `
      SELECT ee.entity_value as value, ee.entity_type as type, COUNT(*) as count
      FROM extracted_entities ee
      JOIN deliberation_cards c ON ee.card_id = c.id
      WHERE c.community_uri = $1
      GROUP BY ee.entity_value, ee.entity_type
      ORDER BY count DESC
      LIMIT 12
    `,
      [communityUri],
    )

    const trending = cards
      .filter((c) => Math.abs(c.influence) > 0)
      .sort((a, b) => Math.abs(b.influence) - Math.abs(a.influence))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        stance: c.influence > 0 ? 'pro' : 'con',
        influence: c.influence,
        voteCount: c.vote_count,
        cardType: c.card_type,
      }))

    const controversial = cards
      .filter((c) => c.vote_count >= 2)
      .sort((a, b) => {
        const aControversy = a.vote_count / (Math.abs(a.influence) + 1)
        const bControversy = b.vote_count / (Math.abs(b.influence) + 1)
        return bControversy - aControversy
      })
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        influence: c.influence,
        voteCount: c.vote_count,
        cardType: c.card_type,
      }))

    let userStats:
      | {
          votesCast: number
          proVotes: number
          conVotes: number
          neutralVotes: number
        }
      | undefined
    if (voterDid) {
      const userVotes = await this.queryAll<{
        id: string
        influence: number
        title: string
      }>(
        `
        SELECT c.id, v.influence, c.title
        FROM card_votes v
        JOIN deliberation_cards c ON v.card_id = c.id
        WHERE c.community_uri = $1 AND v.voter_did = $2
      `,
        [communityUri, voterDid],
      )

      let proVotes = 0,
        conVotes = 0,
        neutralVotes = 0
      for (const v of userVotes) {
        if (v.influence > 0) proVotes++
        else if (v.influence < 0) conVotes++
        else neutralVotes++
      }

      userStats = {
        votesCast: userVotes.length,
        proVotes,
        conVotes,
        neutralVotes,
      }
    }

    return {
      stanceDistribution: { pro, con, neutral },
      topEntities: entities,
      trendingClaims: trending,
      controversialClaims: controversial,
      userStats,
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
