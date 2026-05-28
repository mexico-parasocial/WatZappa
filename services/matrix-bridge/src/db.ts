import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { Config } from './config.js'

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

export class BridgeDatabase {
  private db: Database.Database

  constructor(config: Config) {
    this.db = new Database(config.dbPath)
    this.init()
  }

  private mapCommunitySpace(row: any): CommunitySpaceMap {
    return {
      communityUri: row.community_uri,
      spaceId: row.space_id,
      slug: row.slug,
      chamberMode: row.chamber_mode,
      chamberA_RoomId: row.chamber_a_room_id ?? null,
      chamberB_RoomId: row.chamber_b_room_id ?? null,
      observerRoomId: row.observer_room_id ?? null,
      createdAt: row.created_at,
    }
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS community_space_map (
        community_uri TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        chamber_mode TEXT NOT NULL DEFAULT 'unicameral',
        chamber_a_room_id TEXT,
        chamber_b_room_id TEXT,
        observer_room_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_matrix_map (
        did TEXT PRIMARY KEY,
        matrix_user_id TEXT NOT NULL,
        password TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS community_membership_state (
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        membership_state TEXT NOT NULL,
        roles_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (did, community_uri)
      );

      CREATE INDEX IF NOT EXISTS idx_membership_state_community ON community_membership_state(community_uri);

      CREATE TABLE IF NOT EXISTS chamber_assignment (
        community_uri TEXT NOT NULL,
        did TEXT NOT NULL,
        chamber TEXT NOT NULL,
        PRIMARY KEY (community_uri, did)
      );

      CREATE INDEX IF NOT EXISTS idx_chamber_assignment_community ON chamber_assignment(community_uri);

      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        did TEXT,
        space_id TEXT,
        success INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS community_constitution (
        community_uri TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        rules_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS proposals (
        uri TEXT PRIMARY KEY,
        community_uri TEXT NOT NULL,
        author_did TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        proposal_type TEXT NOT NULL DEFAULT 'general',
        budget_request REAL,
        state TEXT NOT NULL DEFAULT 'deliberating',
        votes_for INTEGER NOT NULL DEFAULT 0,
        votes_against INTEGER NOT NULL DEFAULT 0,
        votes_abstain INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        voting_starts_at TEXT,
        voting_ends_at TEXT,
        decided_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_proposals_community ON proposals(community_uri);
      CREATE INDEX IF NOT EXISTS idx_proposals_state ON proposals(state);
      CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at ASC);

      CREATE TABLE IF NOT EXISTS votes (
        uri TEXT PRIMARY KEY,
        proposal_uri TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        voter_did TEXT NOT NULL,
        choice TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1.0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_uri);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_voter_proposal ON votes(voter_did, proposal_uri);

      CREATE TABLE IF NOT EXISTS sortition_proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        chamber TEXT NOT NULL,
        drand_round INTEGER NOT NULL,
        drand_randomness TEXT NOT NULL,
        hash_input TEXT NOT NULL,
        hash_output TEXT NOT NULL,
        threshold REAL NOT NULL DEFAULT 0.5,
        timestamp TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        UNIQUE(did, community_uri)
      );

      CREATE INDEX IF NOT EXISTS idx_sortition_community ON sortition_proofs(community_uri);
      CREATE INDEX IF NOT EXISTS idx_sortition_did ON sortition_proofs(did);

      CREATE TABLE IF NOT EXISTS sortition_runs (
        id TEXT PRIMARY KEY,
        cabildeo_uri TEXT NOT NULL UNIQUE,
        community_uri TEXT NOT NULL,
        created_by_did TEXT NOT NULL,
        assembly_size INTEGER NOT NULL,
        eligibility_filter TEXT NOT NULL DEFAULT 'all',
        drand_round INTEGER NOT NULL,
        drand_randomness TEXT,
        threshold REAL,
        eligible_count INTEGER NOT NULL DEFAULT 0,
        selected_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'scheduled',
        config_record_json TEXT,
        created_at TEXT NOT NULL,
        processed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sortition_runs_community ON sortition_runs(community_uri);
      CREATE INDEX IF NOT EXISTS idx_sortition_runs_status_round ON sortition_runs(status, drand_round);

      CREATE TABLE IF NOT EXISTS sortition_candidates (
        run_id TEXT NOT NULL,
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        cabildeo_uri TEXT NOT NULL,
        hash_input TEXT NOT NULL,
        hash_output TEXT NOT NULL,
        hash_value REAL NOT NULL,
        threshold REAL NOT NULL,
        selected INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, did)
      );

      CREATE INDEX IF NOT EXISTS idx_sortition_candidates_run_selected ON sortition_candidates(run_id, selected);
      CREATE INDEX IF NOT EXISTS idx_sortition_candidates_did ON sortition_candidates(did);

      CREATE TABLE IF NOT EXISTS decisions (
        proposal_uri TEXT PRIMARY KEY,
        community_uri TEXT NOT NULL,
        result TEXT NOT NULL,
        votes_for INTEGER NOT NULL,
        votes_against INTEGER NOT NULL,
        votes_abstain INTEGER NOT NULL,
        total_members INTEGER,
        quorum_required REAL,
        threshold_required REAL,
        constitution_version INTEGER,
        budget_allocated REAL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_moderation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        event_type TEXT NOT NULL,
        reporter_did TEXT,
        report_reason TEXT,
        reported_event_id TEXT,
        reported_message_preview TEXT,
        sanction_type TEXT,
        sanction_duration_minutes INTEGER,
        sanctioned_by_did TEXT,
        matrix_room_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_moderation_events_did_community ON chat_moderation_events(did, community_uri);
      CREATE INDEX IF NOT EXISTS idx_moderation_events_type_created ON chat_moderation_events(event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_moderation_events_community_created ON chat_moderation_events(community_uri, created_at);

      CREATE TABLE IF NOT EXISTS chat_participation_stats (
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        matrix_room_id TEXT,
        message_count INTEGER DEFAULT 0,
        first_message_at TEXT,
        last_message_at TEXT,
        votes_cast INTEGER DEFAULT 0,
        proposals_created INTEGER DEFAULT 0,
        proposals_reached_quorum INTEGER DEFAULT 0,
        chamber TEXT,
        sortition_proof_id INTEGER,
        is_delegate INTEGER DEFAULT 0,
        is_moderator INTEGER DEFAULT 0,
        joined_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (did, community_uri)
      );

      CREATE INDEX IF NOT EXISTS idx_participation_community ON chat_participation_stats(community_uri);
      CREATE INDEX IF NOT EXISTS idx_participation_joined ON chat_participation_stats(joined_at);

      CREATE TABLE IF NOT EXISTS chat_user_badges (
        did TEXT NOT NULL,
        community_uri TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        severity TEXT,
        visible_in_chat INTEGER DEFAULT 1,
        expires_at TEXT,
        computed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (did, community_uri, badge_type)
      );

      CREATE TABLE IF NOT EXISTS user_chat_preferences (
        did TEXT PRIMARY KEY,
        show_chat_badges INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Deliberation / Knowledge Graph
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
        extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
        is_public INTEGER DEFAULT 0,
        passport_visible INTEGER DEFAULT 0,
        metadata TEXT, -- JSON: entities, policy_refs, sentiment, etc.
        llm_enriched_at TEXT,
        llm_model TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cards_community ON deliberation_cards(community_uri);
      CREATE INDEX IF NOT EXISTS idx_cards_author ON deliberation_cards(author_did);
      CREATE INDEX IF NOT EXISTS idx_cards_type ON deliberation_cards(card_type);

      CREATE TABLE IF NOT EXISTS community_map_contributions (
        id TEXT PRIMARY KEY,
        community_uri TEXT NOT NULL,
        author_did TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        source_url TEXT,
        source_type TEXT NOT NULL DEFAULT 'article',
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        approved_card_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        decided_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_map_contrib_community ON community_map_contributions(community_uri);
      CREATE INDEX IF NOT EXISTS idx_map_contrib_status ON community_map_contributions(status);

      CREATE TABLE IF NOT EXISTS community_map_contribution_votes (
        contribution_id TEXT NOT NULL,
        voter_did TEXT NOT NULL,
        vote TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (contribution_id, voter_did)
      );

      CREATE INDEX IF NOT EXISTS idx_map_contrib_votes_contribution ON community_map_contribution_votes(contribution_id);

      CREATE TABLE IF NOT EXISTS deliberation_relationships (
        id TEXT PRIMARY KEY,
        source_card_id TEXT NOT NULL,
        target_card_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        author_did TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(source_card_id, target_card_id, relationship_type, author_did)
      );

      CREATE INDEX IF NOT EXISTS idx_relationships_source ON deliberation_relationships(source_card_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_target ON deliberation_relationships(target_card_id);

      CREATE TABLE IF NOT EXISTS suggested_relationships (
        id TEXT PRIMARY KEY,
        source_card_id TEXT NOT NULL,
        target_card_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.5,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'pending',
        UNIQUE(source_card_id, target_card_id, relationship_type)
      );

      CREATE INDEX IF NOT EXISTS idx_suggestions_source ON suggested_relationships(source_card_id);
      CREATE INDEX IF NOT EXISTS idx_suggestions_target ON suggested_relationships(target_card_id);
      CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggested_relationships(status);

      CREATE TABLE IF NOT EXISTS card_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        voter_did TEXT NOT NULL,
        influence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(card_id, voter_did)
      );

      CREATE INDEX IF NOT EXISTS idx_votes_card ON card_votes(card_id);
      CREATE INDEX IF NOT EXISTS idx_votes_voter ON card_votes(voter_did);

      CREATE TABLE IF NOT EXISTS extracted_entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_value TEXT NOT NULL,
        start_pos INTEGER,
        end_pos INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_entities_card ON extracted_entities(card_id);
      CREATE INDEX IF NOT EXISTS idx_entities_type_value ON extracted_entities(entity_type, entity_value);

      CREATE TABLE IF NOT EXISTS matrix_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        sender TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        origin_server_ts INTEGER NOT NULL,
        processed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_matrix_events_room ON matrix_events(room_id, origin_server_ts DESC);
      CREATE INDEX IF NOT EXISTS idx_matrix_events_sender ON matrix_events(sender);

      CREATE TABLE IF NOT EXISTS room_read_markers (
        did TEXT NOT NULL,
        room_id TEXT NOT NULL,
        last_read_event_id TEXT,
        last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (did, room_id)
      );

      CREATE INDEX IF NOT EXISTS idx_read_markers_room ON room_read_markers(room_id);

      -- Policy Collections
      CREATE TABLE IF NOT EXISTS policy_collections (
        id TEXT PRIMARY KEY,
        did TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_policy_collections_did ON policy_collections(did);

      CREATE TABLE IF NOT EXISTS policy_collection_items (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        policy_uri TEXT NOT NULL,
        policy_data TEXT NOT NULL,
        note TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (collection_id) REFERENCES policy_collections(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON policy_collection_items(collection_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_items_unique ON policy_collection_items(collection_id, policy_uri);
    `)
  }

  // Community <-> Space mappings
  getSpaceForCommunity(communityUri: string): CommunitySpaceMap | undefined {
    const row = this.db
      .prepare('SELECT * FROM community_space_map WHERE community_uri = ?')
      .get(communityUri) as any | undefined
    return row ? this.mapCommunitySpace(row) : undefined
  }

  setSpaceForCommunity(
    communityUri: string,
    spaceId: string,
    slug: string,
    chamberMode = 'unicameral',
  ): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO community_space_map (community_uri, space_id, slug, chamber_mode, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run(communityUri, spaceId, slug, chamberMode)
  }

  setChamberRooms(
    communityUri: string,
    chamberA: string | null,
    chamberB: string | null,
    observerRoom: string | null,
  ): void {
    this.db
      .prepare(
        'UPDATE community_space_map SET chamber_a_room_id = ?, chamber_b_room_id = ?, observer_room_id = ? WHERE community_uri = ?',
      )
      .run(chamberA, chamberB, observerRoom, communityUri)
  }

  // Chamber assignments
  getChamberAssignment(communityUri: string, did: string): string | undefined {
    const row = this.db
      .prepare(
        'SELECT chamber FROM chamber_assignment WHERE community_uri = ? AND did = ?',
      )
      .get(communityUri, did) as { chamber: string } | undefined
    return row?.chamber
  }

  setChamberAssignment(
    communityUri: string,
    did: string,
    chamber: string,
  ): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO chamber_assignment (community_uri, did, chamber) VALUES (?, ?, ?)',
      )
      .run(communityUri, did, chamber)
  }

  getChamberMemberCount(communityUri: string, chamber: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM chamber_assignment WHERE community_uri = ? AND chamber = ?',
      )
      .get(communityUri, chamber) as { count: number }
    return row.count
  }

  // User <-> MXID mappings
  getMxidForDid(did: string): string | undefined {
    const row = this.db
      .prepare('SELECT matrix_user_id FROM user_matrix_map WHERE did = ?')
      .get(did) as { matrix_user_id: string } | undefined
    return row?.matrix_user_id
  }

  setMxidForDid(did: string, mxid: string, password: string): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO user_matrix_map (did, matrix_user_id, password) VALUES (?, ?, ?)',
      )
      .run(did, mxid, password)
  }

  getUserPassword(did: string): string | undefined {
    const row = this.db
      .prepare('SELECT password FROM user_matrix_map WHERE did = ?')
      .get(did) as { password: string } | undefined
    return row?.password
  }

  setCommunityMembership(
    did: string,
    communityUri: string,
    membershipState: string,
    roles: string[] = [],
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO community_membership_state
          (did, community_uri, membership_state, roles_json, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
      .run(did, communityUri, membershipState, JSON.stringify(roles))
  }

  isActiveCommunityMember(did: string, communityUri: string): boolean {
    const row = this.db
      .prepare(
        'SELECT membership_state FROM community_membership_state WHERE did = ? AND community_uri = ?',
      )
      .get(did, communityUri) as { membership_state: string } | undefined
    return row?.membership_state === 'active'
  }

  getActiveCommunityRoomsForDid(
    did: string,
  ): { roomId: string; communityUri: string; slug: string }[] {
    const rows = this.db
      .prepare(
        `SELECT csm.space_id as room_id, csm.community_uri, csm.slug
         FROM community_space_map csm
         INNER JOIN community_membership_state cms
           ON cms.community_uri = csm.community_uri
         WHERE cms.did = ? AND cms.membership_state = 'active'`,
      )
      .all(did) as { room_id: string; community_uri: string; slug: string }[]
    return rows.map((row) => ({
      roomId: row.room_id,
      communityUri: row.community_uri,
      slug: row.slug,
    }))
  }

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

  // Lookup community by any of its room IDs
  getCommunityByRoomId(
    roomId: string,
  ): { communityUri: string; slug: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT community_uri, slug FROM community_space_map WHERE space_id = ? OR chamber_a_room_id = ? OR chamber_b_room_id = ? OR observer_room_id = ?`,
      )
      .get(roomId, roomId, roomId, roomId) as
      | { community_uri: string; slug: string }
      | undefined
    return row ? { communityUri: row.community_uri, slug: row.slug } : undefined
  }

  // Get DID by MXID
  getDidForMxid(mxid: string): string | undefined {
    const row = this.db
      .prepare('SELECT did FROM user_matrix_map WHERE matrix_user_id = ?')
      .get(mxid) as { did: string } | undefined
    return row?.did
  }

  // Constitutions
  setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO community_constitution (community_uri, version, rules_json, created_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(communityUri, version, rulesJson)
  }

  getConstitution(communityUri: string):
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined {
    const row = this.db
      .prepare('SELECT * FROM community_constitution WHERE community_uri = ?')
      .get(communityUri) as
      | {
          community_uri: string
          version: number
          rules_json: string
          created_at: string
        }
      | undefined
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
  insertProposal(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO proposals (uri, community_uri, author_did, title, body, proposal_type, budget_request, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        uri,
        communityUri,
        authorDid,
        title,
        body,
        proposalType,
        budgetRequest,
        createdAt,
      )
  }

  getProposal(uri: string): any | undefined {
    return this.db.prepare('SELECT * FROM proposals WHERE uri = ?').get(uri)
  }

  getProposalsByCommunity(communityUri: string, state?: string): any[] {
    if (state) {
      return this.db
        .prepare(
          'SELECT * FROM proposals WHERE community_uri = ? AND state = ? ORDER BY created_at ASC',
        )
        .all(communityUri, state) as any[]
    }
    return this.db
      .prepare(
        'SELECT * FROM proposals WHERE community_uri = ? ORDER BY created_at ASC',
      )
      .all(communityUri) as any[]
  }

  getProposalsByState(state: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM proposals WHERE state = ? ORDER BY created_at ASC',
      )
      .all(state) as any[]
  }

  updateProposalState(
    uri: string,
    state: string,
    votingStartsAt?: string,
    votingEndsAt?: string,
  ): void {
    this.db
      .prepare(
        'UPDATE proposals SET state = ?, voting_starts_at = ?, voting_ends_at = ? WHERE uri = ?',
      )
      .run(state, votingStartsAt ?? null, votingEndsAt ?? null, uri)
  }

  updateProposalVoteCounts(
    uri: string,
    forVotes: number,
    againstVotes: number,
    abstainVotes: number,
  ): void {
    this.db
      .prepare(
        'UPDATE proposals SET votes_for = ?, votes_against = ?, votes_abstain = ? WHERE uri = ?',
      )
      .run(forVotes, againstVotes, abstainVotes, uri)
  }

  finalizeProposal(uri: string, result: string, decidedAt: string): void {
    this.db
      .prepare('UPDATE proposals SET state = ?, decided_at = ? WHERE uri = ?')
      .run(result, decidedAt, uri)
  }

  // Votes
  insertVote(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    weight: number,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO votes (uri, proposal_uri, community_uri, voter_did, choice, weight, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(uri, proposalUri, communityUri, voterDid, choice, weight, createdAt)
  }

  getVotesForProposal(proposalUri: string): any[] {
    return this.db
      .prepare('SELECT * FROM votes WHERE proposal_uri = ?')
      .all(proposalUri) as any[]
  }

  // Decisions
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
  ): void {
    this.db
      .prepare(
        'INSERT INTO decisions (proposal_uri, community_uri, result, votes_for, votes_against, votes_abstain, total_members, quorum_required, threshold_required, constitution_version, budget_allocated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
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
      )
  }

  getDecision(proposalUri: string): any | undefined {
    return this.db
      .prepare('SELECT * FROM decisions WHERE proposal_uri = ?')
      .get(proposalUri)
  }

  getDecisionsByCommunity(communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM decisions WHERE community_uri = ? ORDER BY created_at DESC',
      )
      .all(communityUri) as any[]
  }

  // Sortition proofs
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
  }): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO sortition_proofs (did, community_uri, chamber, drand_round, drand_randomness, hash_input, hash_output, threshold, timestamp, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
      )
      .run(
        proof.did,
        proof.communityUri,
        proof.chamber,
        proof.drandRound,
        proof.drandRandomness,
        proof.hashInput,
        proof.hashOutput,
        proof.threshold,
        proof.timestamp,
      )
  }

  getSortitionProof(did: string, communityUri: string): any | undefined {
    return this.db
      .prepare(
        'SELECT * FROM sortition_proofs WHERE did = ? AND community_uri = ?',
      )
      .get(did, communityUri)
  }

  getSortitionProofsByCommunity(communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM sortition_proofs WHERE community_uri = ? ORDER BY timestamp DESC',
      )
      .all(communityUri) as any[]
  }

  getUnverifiedProofs(limit = 100): any[] {
    return this.db
      .prepare(
        'SELECT * FROM sortition_proofs WHERE verified = 0 ORDER BY timestamp DESC LIMIT ?',
      )
      .all(limit) as any[]
  }

  markProofVerified(id: number): void {
    this.db
      .prepare('UPDATE sortition_proofs SET verified = 1 WHERE id = ?')
      .run(id)
  }

  getSortitionProofCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM sortition_proofs')
      .get() as { count: number }
    return row.count
  }

  // Cabildeo sortition assemblies
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
  }): any {
    this.db
      .prepare(
        `INSERT INTO sortition_runs (
          id, cabildeo_uri, community_uri, created_by_did, assembly_size,
          eligibility_filter, drand_round, status, config_record_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      )
      .run(
        run.id,
        run.cabildeoUri,
        run.communityUri,
        run.createdByDid,
        run.assemblySize,
        run.eligibilityFilter,
        run.drandRound,
        run.configRecordJson,
        run.createdAt,
      )
    return this.getSortitionRun(run.id)
  }

  getSortitionRun(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM sortition_runs WHERE id = ?').get(id)
  }

  getSortitionRunByCabildeo(cabildeoUri: string): any | undefined {
    return this.db
      .prepare('SELECT * FROM sortition_runs WHERE cabildeo_uri = ?')
      .get(cabildeoUri)
  }

  getScheduledSortitionRuns(limit = 10): any[] {
    return this.db
      .prepare(
        'SELECT * FROM sortition_runs WHERE status = ? ORDER BY drand_round ASC LIMIT ?',
      )
      .all('scheduled', limit) as any[]
  }

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
  ): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO sortition_candidates (
        run_id, did, community_uri, cabildeo_uri, hash_input, hash_output,
        hash_value, threshold, selected, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const tx = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM sortition_candidates WHERE run_id = ?')
        .run(runId)
      for (const candidate of candidates) {
        insert.run(
          runId,
          candidate.did,
          candidate.communityUri,
          candidate.cabildeoUri,
          candidate.hashInput,
          candidate.hashOutput,
          candidate.hashValue,
          candidate.threshold,
          candidate.selected ? 1 : 0,
          candidate.createdAt,
        )
      }
    })
    tx()
  }

  activateSortitionRun(run: {
    id: string
    drandRandomness: string
    threshold: number
    eligibleCount: number
    selectedCount: number
    processedAt: string
  }): any | undefined {
    this.db
      .prepare(
        `UPDATE sortition_runs
         SET status = 'active',
             drand_randomness = ?,
             threshold = ?,
             eligible_count = ?,
             selected_count = ?,
             processed_at = ?
         WHERE id = ?`,
      )
      .run(
        run.drandRandomness,
        run.threshold,
        run.eligibleCount,
        run.selectedCount,
        run.processedAt,
        run.id,
      )
    return this.getSortitionRun(run.id)
  }

  failSortitionRun(id: string): void {
    this.db
      .prepare(
        "UPDATE sortition_runs SET status = 'failed', processed_at = datetime('now') WHERE id = ?",
      )
      .run(id)
  }

  getSortitionCandidates(runId: string, selectedOnly = false): any[] {
    const sql = selectedOnly
      ? 'SELECT * FROM sortition_candidates WHERE run_id = ? AND selected = 1 ORDER BY hash_value ASC'
      : 'SELECT * FROM sortition_candidates WHERE run_id = ? ORDER BY hash_value ASC'
    return this.db.prepare(sql).all(runId) as any[]
  }

  getSortitionCandidate(runId: string, did: string): any | undefined {
    return this.db
      .prepare(
        'SELECT * FROM sortition_candidates WHERE run_id = ? AND did = ?',
      )
      .get(runId, did)
  }

  // Chat moderation events
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
  }): void {
    this.db
      .prepare(
        'INSERT INTO chat_moderation_events (did, community_uri, event_type, reporter_did, report_reason, reported_event_id, reported_message_preview, sanction_type, sanction_duration_minutes, sanctioned_by_did, matrix_room_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        event.did,
        event.communityUri,
        event.eventType,
        event.reporterDid ?? null,
        event.reportReason ?? null,
        event.reportedEventId ?? null,
        event.reportedMessagePreview ?? null,
        event.sanctionType ?? null,
        event.sanctionDurationMinutes ?? null,
        event.sanctionedByDid ?? null,
        event.matrixRoomId ?? null,
      )
  }

  getModerationEvents(
    did: string,
    communityUri: string,
    sinceDays = 90,
  ): any[] {
    return this.db
      .prepare(
        "SELECT * FROM chat_moderation_events WHERE did = ? AND community_uri = ? AND created_at >= datetime('now', '-' || ? || ' days') ORDER BY created_at DESC",
      )
      .all(did, communityUri, sinceDays) as any[]
  }

  getRecentReportsForCommunity(communityUri: string, days = 30): any[] {
    return this.db
      .prepare(
        "SELECT * FROM chat_moderation_events WHERE community_uri = ? AND event_type = 'report_received' AND created_at >= datetime('now', '-' || ? || ' days') ORDER BY created_at DESC",
      )
      .all(communityUri, days) as any[]
  }

  getActiveSanctions(did: string, communityUri: string): any[] {
    return this.db
      .prepare(
        "SELECT * FROM chat_moderation_events WHERE did = ? AND community_uri = ? AND event_type IN ('mute','ban') AND created_at >= datetime('now', '-90 days') ORDER BY created_at DESC",
      )
      .all(did, communityUri) as any[]
  }

  // Chat participation stats
  getParticipationStats(did: string, communityUri: string): any | undefined {
    return this.db
      .prepare(
        'SELECT * FROM chat_participation_stats WHERE did = ? AND community_uri = ?',
      )
      .get(did, communityUri)
  }

  ensureParticipationStats(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO chat_participation_stats (did, community_uri, matrix_room_id, joined_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(did, communityUri, matrixRoomId ?? null)
  }

  incrementMessageCount(did: string, communityUri: string): void {
    this.db
      .prepare(
        "UPDATE chat_participation_stats SET message_count = message_count + 1, last_message_at = datetime('now'), updated_at = datetime('now') WHERE did = ? AND community_uri = ?",
      )
      .run(did, communityUri)
  }

  incrementVoteCount(did: string, communityUri: string): void {
    this.db
      .prepare(
        "UPDATE chat_participation_stats SET votes_cast = votes_cast + 1, updated_at = datetime('now') WHERE did = ? AND community_uri = ?",
      )
      .run(did, communityUri)
  }

  incrementProposalCount(did: string, communityUri: string): void {
    this.db
      .prepare(
        "UPDATE chat_participation_stats SET proposals_created = proposals_created + 1, updated_at = datetime('now') WHERE did = ? AND community_uri = ?",
      )
      .run(did, communityUri)
  }

  setParticipationRoles(
    did: string,
    communityUri: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): void {
    const parts: string[] = []
    const values: (string | number | null)[] = []
    if (roles.isDelegate !== undefined) {
      parts.push('is_delegate = ?')
      values.push(roles.isDelegate ? 1 : 0)
    }
    if (roles.isModerator !== undefined) {
      parts.push('is_moderator = ?')
      values.push(roles.isModerator ? 1 : 0)
    }
    if (roles.chamber !== undefined) {
      parts.push('chamber = ?')
      values.push(roles.chamber)
    }
    if (parts.length === 0) return
    values.push(did, communityUri)
    this.db
      .prepare(
        `UPDATE chat_participation_stats SET ${parts.join(', ')}, updated_at = datetime('now') WHERE did = ? AND community_uri = ?`,
      )
      .run(...values)
  }

  getParticipationStatsByCommunity(communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM chat_participation_stats WHERE community_uri = ? ORDER BY message_count DESC',
      )
      .all(communityUri) as any[]
  }

  // Chat user badges (computed cache)
  setUserBadge(badge: {
    did: string
    communityUri: string
    badgeType: string
    severity?: string | null
    visibleInChat?: number
    expiresAt?: string | null
  }): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO chat_user_badges (did, community_uri, badge_type, severity, visible_in_chat, expires_at, computed_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
      )
      .run(
        badge.did,
        badge.communityUri,
        badge.badgeType,
        badge.severity ?? null,
        badge.visibleInChat ?? 1,
        badge.expiresAt ?? null,
      )
  }

  clearUserBadges(did: string, communityUri: string): void {
    this.db
      .prepare(
        'DELETE FROM chat_user_badges WHERE did = ? AND community_uri = ?',
      )
      .run(did, communityUri)
  }

  getUserBadges(did: string, communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM chat_user_badges WHERE did = ? AND community_uri = ?',
      )
      .all(did, communityUri) as any[]
  }

  getCommunityBadgeSummary(communityUri: string): {
    warning: number
    critical: number
  } {
    const row = this.db
      .prepare(
        "SELECT COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warning, COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical FROM chat_user_badges WHERE community_uri = ? AND visible_in_chat = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
      )
      .get(communityUri) as { warning: number; critical: number }
    return row
  }

  getMemberList(communityUri: string, limit = 100, offset = 0): any[] {
    return this.db
      .prepare(
        'SELECT ps.*, umm.matrix_user_id FROM chat_participation_stats ps LEFT JOIN user_matrix_map umm ON ps.did = umm.did WHERE ps.community_uri = ? ORDER BY ps.last_message_at DESC LIMIT ? OFFSET ?',
      )
      .all(communityUri, limit, offset) as any[]
  }

  expireBadges(): void {
    this.db
      .prepare(
        "DELETE FROM chat_user_badges WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')",
      )
      .run()
  }

  // User chat preferences
  getChatPreferences(did: string): { showChatBadges: boolean } {
    const row = this.db
      .prepare(
        'SELECT show_chat_badges FROM user_chat_preferences WHERE did = ?',
      )
      .get(did) as { show_chat_badges: number } | undefined
    return { showChatBadges: row ? row.show_chat_badges === 1 : false }
  }

  setChatPreferences(did: string, showChatBadges: boolean): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO user_chat_preferences (did, show_chat_badges, updated_at) VALUES (?, ?, datetime('now'))",
      )
      .run(did, showChatBadges ? 1 : 0)
  }

  // Matrix event ingestion
  insertMatrixEvent(event: {
    roomId: string
    eventId: string
    sender: string
    type: string
    content?: string | null
    originServerTs: number
  }): boolean {
    try {
      this.db
        .prepare(
          'INSERT INTO matrix_events (room_id, event_id, sender, type, content, origin_server_ts) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          event.roomId,
          event.eventId,
          event.sender,
          event.type,
          event.content ?? null,
          event.originServerTs,
        )
      return true
    } catch (err: any) {
      // Duplicate event_id — ignore
      if (err.message?.includes('UNIQUE constraint failed')) {
        return false
      }
      throw err
    }
  }

  eventExists(eventId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM matrix_events WHERE event_id = ?')
      .get(eventId) as { 1: number } | undefined
    return !!row
  }

  getRecentEvents(roomId: string, limit = 100): any[] {
    return this.db
      .prepare(
        'SELECT * FROM matrix_events WHERE room_id = ? ORDER BY origin_server_ts DESC LIMIT ?',
      )
      .all(roomId, limit) as any[]
  }

  // Read markers & unread counts
  setReadMarker(did: string, roomId: string, eventId: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO room_read_markers (did, room_id, last_read_event_id, last_read_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(did, roomId, eventId)
  }

  getUnreadCount(did: string, roomId: string): number {
    const marker = this.db
      .prepare(
        'SELECT last_read_event_id FROM room_read_markers WHERE did = ? AND room_id = ?',
      )
      .get(did, roomId) as { last_read_event_id: string } | undefined

    if (!marker?.last_read_event_id) {
      // No marker — count all events in the last 7 days, capped at 99
      const row = this.db
        .prepare(
          "SELECT COUNT(*) as count FROM matrix_events WHERE room_id = ? AND origin_server_ts > ? AND type IN ('m.room.message', 'm.room.encrypted')",
        )
        .get(roomId, Date.now() - 7 * 24 * 60 * 60 * 1000) as { count: number }
      return Math.min(row.count, 99)
    }

    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM matrix_events me
        WHERE me.room_id = ? AND me.type IN ('m.room.message', 'm.room.encrypted')
        AND me.origin_server_ts > (
          SELECT origin_server_ts FROM matrix_events WHERE event_id = ?
        )`,
      )
      .get(roomId, marker.last_read_event_id) as { count: number }
    return row.count
  }

  getUnreadCountsForDid(
    did: string,
  ): { roomId: string; communityUri: string; slug: string; unread: number }[] {
    return this.getActiveCommunityRoomsForDid(did).map((r) => ({
      roomId: r.roomId,
      communityUri: r.communityUri,
      slug: r.slug,
      unread: this.getUnreadCount(did, r.roomId),
    }))
  }

  getTotalUnreadForDid(did: string): number {
    const counts = this.getUnreadCountsForDid(did)
    return counts.reduce((sum, c) => sum + c.unread, 0)
  }

  // Get all tracked room IDs
  getAllRoomIds(): string[] {
    const rows = this.db
      .prepare(
        'SELECT space_id, chamber_a_room_id, chamber_b_room_id, observer_room_id FROM community_space_map',
      )
      .all() as Array<{
      space_id: string | null
      chamber_a_room_id: string | null
      chamber_b_room_id: string | null
      observer_room_id: string | null
    }>
    return Array.from(
      new Set(
        rows.flatMap((r) =>
          [
            r.space_id,
            r.chamber_a_room_id,
            r.chamber_b_room_id,
            r.observer_room_id,
          ].filter((id): id is string => Boolean(id)),
        ),
      ),
    )
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
  }): void {
    this.db
      .prepare(
        "INSERT INTO deliberation_cards (id, community_uri, author_did, title, content, card_type, source_room_id, source_event_id, source_url, is_public, passport_visible, metadata, extracted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
      )
      .run(
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
      )
  }

  getCardsForCommunity(
    communityUri: string,
    opts: {
      limit?: number
      offset?: number
      cardType?: string
      authorDid?: string
    } = {},
  ): any[] {
    let sql = 'SELECT * FROM deliberation_cards WHERE community_uri = ?'
    const params: (string | number)[] = [communityUri]
    if (opts.cardType) {
      sql += ' AND card_type = ?'
      params.push(opts.cardType)
    }
    if (opts.authorDid) {
      sql += ' AND author_did = ?'
      params.push(opts.authorDid)
    }
    sql += ' ORDER BY extracted_at DESC'
    if (opts.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    if (opts.offset) {
      sql += ' OFFSET ?'
      params.push(opts.offset)
    }
    return this.db.prepare(sql).all(...params) as any[]
  }

  getCard(id: string): any | undefined {
    return this.db
      .prepare('SELECT * FROM deliberation_cards WHERE id = ?')
      .get(id)
  }

  getCardCount(communityUri: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM deliberation_cards WHERE community_uri = ?',
      )
      .get(communityUri) as { count: number }
    return row.count
  }

  // ── Community Map Contributions ──

  private mapCommunityContribution(row: any, viewerDid?: string): any {
    const counts = this.getCommunityContributionVoteCounts(row.id)
    const viewerVote = viewerDid
      ? this.getCommunityContributionVote(row.id, viewerDid)
      : undefined
    return {
      id: row.id,
      community_uri: row.community_uri,
      author_did: row.author_did,
      title: row.title,
      content: row.content,
      source_url: row.source_url,
      source_type: row.source_type,
      metadata: row.metadata,
      status: row.status,
      approved_card_id: row.approved_card_id,
      created_at: row.created_at,
      decided_at: row.decided_at,
      approve_count: counts.approve,
      reject_count: counts.reject,
      viewer_vote: viewerVote?.vote,
    }
  }

  insertCommunityMapContribution(contribution: {
    id: string
    communityUri: string
    authorDid: string
    title: string
    content?: string
    sourceUrl?: string
    sourceType: string
    metadata?: string
  }): void {
    this.db
      .prepare(
        'INSERT INTO community_map_contributions (id, community_uri, author_did, title, content, source_url, source_type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        contribution.id,
        contribution.communityUri,
        contribution.authorDid,
        contribution.title,
        contribution.content ?? null,
        contribution.sourceUrl ?? null,
        contribution.sourceType,
        contribution.metadata ?? null,
      )
  }

  getCommunityMapContributions(
    communityUri: string,
    opts: { status?: string; viewerDid?: string; limit?: number } = {},
  ): any[] {
    let sql =
      'SELECT * FROM community_map_contributions WHERE community_uri = ?'
    const params: (string | number)[] = [communityUri]
    if (opts.status) {
      sql += ' AND status = ?'
      params.push(opts.status)
    }
    sql += ' ORDER BY created_at DESC'
    if (opts.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map((row) => this.mapCommunityContribution(row, opts.viewerDid))
  }

  getCommunityMapContribution(id: string, viewerDid?: string): any | undefined {
    const row = this.db
      .prepare('SELECT * FROM community_map_contributions WHERE id = ?')
      .get(id)
    return row ? this.mapCommunityContribution(row, viewerDid) : undefined
  }

  getCommunityContributionVote(
    contributionId: string,
    voterDid: string,
  ): { vote: string } | undefined {
    return this.db
      .prepare(
        'SELECT vote FROM community_map_contribution_votes WHERE contribution_id = ? AND voter_did = ?',
      )
      .get(contributionId, voterDid) as { vote: string } | undefined
  }

  getCommunityContributionVoteCounts(contributionId: string): {
    approve: number
    reject: number
  } {
    const rows = this.db
      .prepare(
        'SELECT vote, COUNT(*) as count FROM community_map_contribution_votes WHERE contribution_id = ? GROUP BY vote',
      )
      .all(contributionId) as Array<{ vote: string; count: number }>
    return {
      approve: rows.find((row) => row.vote === 'approve')?.count ?? 0,
      reject: rows.find((row) => row.vote === 'reject')?.count ?? 0,
    }
  }

  voteCommunityMapContribution(
    contributionId: string,
    voterDid: string,
    vote: 'approve' | 'reject',
  ): any {
    const decide = this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT * FROM community_map_contributions WHERE id = ?')
        .get(contributionId) as any | undefined
      if (!existing) {
        throw new Error('Contribution not found')
      }
      if (existing.status !== 'pending') {
        return this.mapCommunityContribution(existing, voterDid)
      }

      this.db
        .prepare(
          "INSERT OR REPLACE INTO community_map_contribution_votes (contribution_id, voter_did, vote, created_at) VALUES (?, ?, ?, datetime('now'))",
        )
        .run(contributionId, voterDid, vote)

      const counts = this.getCommunityContributionVoteCounts(contributionId)
      const shouldApprove =
        counts.approve >= 3 && counts.approve - counts.reject >= 2
      const shouldReject =
        counts.reject >= 3 && counts.reject - counts.approve >= 2

      if (shouldApprove) {
        const cardId = randomUUID()
        this.insertCard({
          id: cardId,
          communityUri: existing.community_uri,
          authorDid: existing.author_did,
          title: existing.title,
          content: existing.content ?? undefined,
          cardType: existing.source_type,
          sourceUrl: existing.source_url ?? undefined,
          isPublic: 1,
          passportVisible: 1,
          metadata: existing.metadata ?? undefined,
        })
        this.db
          .prepare(
            "UPDATE community_map_contributions SET status = ?, approved_card_id = ?, decided_at = datetime('now') WHERE id = ?",
          )
          .run('approved', cardId, contributionId)
      } else if (shouldReject) {
        this.db
          .prepare(
            "UPDATE community_map_contributions SET status = ?, decided_at = datetime('now') WHERE id = ?",
          )
          .run('rejected', contributionId)
      }

      const updated = this.db
        .prepare('SELECT * FROM community_map_contributions WHERE id = ?')
        .get(contributionId) as any
      return this.mapCommunityContribution(updated, voterDid)
    })

    return decide()
  }

  getCardsPendingLLMEnrichment(limit = 10): any[] {
    return this.db
      .prepare(
        'SELECT * FROM deliberation_cards WHERE llm_enriched_at IS NULL ORDER BY extracted_at DESC LIMIT ?',
      )
      .all(limit) as any[]
  }

  markCardEnriched(id: string, model: string): void {
    this.db
      .prepare(
        "UPDATE deliberation_cards SET llm_enriched_at = datetime('now'), llm_model = ? WHERE id = ?",
      )
      .run(model, id)
  }

  updateCardVisibility(
    id: string,
    isPublic: number,
    passportVisible: number,
  ): void {
    this.db
      .prepare(
        'UPDATE deliberation_cards SET is_public = ?, passport_visible = ? WHERE id = ?',
      )
      .run(isPublic, passportVisible, id)
  }

  // ── Card Votes (Influence) ──

  upsertCardVote(cardId: string, voterDid: string, influence: number): void {
    this.db
      .prepare(
        `
        INSERT INTO card_votes (card_id, voter_did, influence, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(card_id, voter_did) DO UPDATE SET
          influence = excluded.influence,
          updated_at = datetime('now')
      `,
      )
      .run(cardId, voterDid, influence)
  }

  getCardVote(
    cardId: string,
    voterDid: string,
  ): { influence: number } | undefined {
    return this.db
      .prepare(
        'SELECT influence FROM card_votes WHERE card_id = ? AND voter_did = ?',
      )
      .get(cardId, voterDid) as { influence: number } | undefined
  }

  getCardVotes(
    cardId: string,
  ): Array<{ voter_did: string; influence: number }> {
    return this.db
      .prepare('SELECT voter_did, influence FROM card_votes WHERE card_id = ?')
      .all(cardId) as Array<{ voter_did: string; influence: number }>
  }

  getCardInfluenceScores(cardIds: string[]): Map<string, number> {
    if (cardIds.length === 0) return new Map()
    const placeholders = cardIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT card_id, SUM(influence) as total FROM card_votes WHERE card_id IN (${placeholders}) GROUP BY card_id`,
      )
      .all(...cardIds) as Array<{ card_id: string; total: number }>
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.card_id, row.total)
    }
    return map
  }

  getCardVoteStats(
    cardIds: string[],
  ): Map<string, { total: number; count: number }> {
    if (cardIds.length === 0) return new Map()
    const placeholders = cardIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT card_id, SUM(influence) as total, COUNT(*) as count FROM card_votes WHERE card_id IN (${placeholders}) GROUP BY card_id`,
      )
      .all(...cardIds) as Array<{
      card_id: string
      total: number
      count: number
    }>
    const map = new Map<string, { total: number; count: number }>()
    for (const row of rows) {
      map.set(row.card_id, { total: row.total, count: row.count })
    }
    return map
  }

  // ── Relationships ──

  insertRelationship(rel: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    authorDid: string
  }): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO deliberation_relationships (id, source_card_id, target_card_id, relationship_type, author_did) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        rel.id,
        rel.sourceCardId,
        rel.targetCardId,
        rel.relationshipType,
        rel.authorDid,
      )
  }

  getRelationshipsForCard(cardId: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM deliberation_relationships WHERE source_card_id = ? OR target_card_id = ?',
      )
      .all(cardId, cardId) as any[]
  }

  getGraphForCommunity(communityUri: string): { nodes: any[]; edges: any[] } {
    const nodes = this.db
      .prepare('SELECT * FROM deliberation_cards WHERE community_uri = ?')
      .all(communityUri) as any[]
    const cardIds = nodes.map((n: any) => n.id)
    if (cardIds.length === 0) return { nodes: [], edges: [] }
    const placeholders = cardIds.map(() => '?').join(',')
    const edges = this.db
      .prepare(
        `SELECT * FROM deliberation_relationships WHERE source_card_id IN (${placeholders}) OR target_card_id IN (${placeholders})`,
      )
      .all(...cardIds, ...cardIds) as any[]
    const voteStats = this.getCardVoteStats(cardIds)
    for (const node of nodes) {
      const stats = voteStats.get(node.id)
      node.influence = stats?.total ?? 0
      node.vote_count = stats?.count ?? 0
      node.stance =
        node.influence > 0 ? 'pro' : node.influence < 0 ? 'con' : 'neutral'
    }
    return { nodes, edges }
  }

  deleteRelationship(id: string): void {
    this.db
      .prepare('DELETE FROM deliberation_relationships WHERE id = ?')
      .run(id)
  }

  // ── Suggested Relationships ──

  insertSuggestedRelationship(sugg: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    confidence: number
    reason: string
  }): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO suggested_relationships (id, source_card_id, target_card_id, relationship_type, confidence, reason) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        sugg.id,
        sugg.sourceCardId,
        sugg.targetCardId,
        sugg.relationshipType,
        sugg.confidence,
        sugg.reason,
      )
  }

  getSuggestionsForCommunity(
    communityUri: string,
    opts: { status?: string; limit?: number } = {},
  ): any[] {
    let sql = `SELECT sr.*, sc.title as source_title, sc.card_type as source_type, tc.title as target_title, tc.card_type as target_type
      FROM suggested_relationships sr
      JOIN deliberation_cards sc ON sr.source_card_id = sc.id
      JOIN deliberation_cards tc ON sr.target_card_id = tc.id
      WHERE sc.community_uri = ?`
    const params: (string | number)[] = [communityUri]
    if (opts.status) {
      sql += ' AND sr.status = ?'
      params.push(opts.status)
    }
    sql += ' ORDER BY sr.confidence DESC'
    if (opts.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    return this.db.prepare(sql).all(...params) as any[]
  }

  acceptSuggestion(id: string, authorDid: string): void {
    const sugg = this.db
      .prepare('SELECT * FROM suggested_relationships WHERE id = ?')
      .get(id) as
      | {
          source_card_id: string
          target_card_id: string
          relationship_type: string
        }
      | undefined
    if (!sugg) return
    this.db
      .prepare('UPDATE suggested_relationships SET status = ? WHERE id = ?')
      .run('accepted', id)
    this.insertRelationship({
      id: randomUUID(),
      sourceCardId: sugg.source_card_id,
      targetCardId: sugg.target_card_id,
      relationshipType: sugg.relationship_type,
      authorDid,
    })
  }

  rejectSuggestion(id: string): void {
    this.db
      .prepare('UPDATE suggested_relationships SET status = ? WHERE id = ?')
      .run('rejected', id)
  }

  // ── Extracted Entities ──

  insertEntity(entity: {
    cardId: string
    entityType: string
    entityValue: string
    startPos?: number
    endPos?: number
  }): void {
    this.db
      .prepare(
        'INSERT INTO extracted_entities (card_id, entity_type, entity_value, start_pos, end_pos) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        entity.cardId,
        entity.entityType,
        entity.entityValue,
        entity.startPos ?? null,
        entity.endPos ?? null,
      )
  }

  getEntitiesForCard(cardId: string): any[] {
    return this.db
      .prepare('SELECT * FROM extracted_entities WHERE card_id = ?')
      .all(cardId) as any[]
  }

  // ── Community Pulse (Discourse Analysis) ──

  getCommunityPulse(
    communityUri: string,
    voterDid?: string,
  ): {
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
      topAgreedTopic?: string
      topDisagreedTopic?: string
    }
  } {
    // Get all cards for community with their vote stats
    const cards = this.db
      .prepare(
        `
      SELECT c.id, c.title, c.card_type,
        COALESCE(SUM(v.influence), 0) as influence,
        COUNT(v.id) as vote_count
      FROM deliberation_cards c
      LEFT JOIN card_votes v ON c.id = v.card_id
      WHERE c.community_uri = ?
      GROUP BY c.id
    `,
      )
      .all(communityUri) as Array<{
      id: string
      title: string
      card_type: string
      influence: number
      vote_count: number
    }>

    // Stance distribution
    let pro = 0,
      con = 0,
      neutral = 0
    for (const card of cards) {
      if (card.influence > 0) pro++
      else if (card.influence < 0) con++
      else neutral++
    }

    // Top entities across community cards
    const entities = this.db
      .prepare(
        `
      SELECT ee.entity_value as value, ee.entity_type as type, COUNT(*) as count
      FROM extracted_entities ee
      JOIN deliberation_cards c ON ee.card_id = c.id
      WHERE c.community_uri = ?
      GROUP BY ee.entity_value, ee.entity_type
      ORDER BY count DESC
      LIMIT 12
    `,
      )
      .all(communityUri) as Array<{
      value: string
      type: string
      count: number
    }>

    // Trending claims: highest absolute influence
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

    // Controversial: high vote count but low |influence| (divided opinions)
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

    // User stats
    let userStats:
      | {
          votesCast: number
          proVotes: number
          conVotes: number
          neutralVotes: number
        }
      | undefined
    if (voterDid) {
      const userVotes = this.db
        .prepare(
          `
        SELECT c.id, v.influence, c.title
        FROM card_votes v
        JOIN deliberation_cards c ON v.card_id = c.id
        WHERE c.community_uri = ? AND v.voter_did = ?
      `,
        )
        .all(communityUri, voterDid) as Array<{
        id: string
        influence: number
        title: string
      }>

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

  close(): void {
    this.db.close()
  }
}
