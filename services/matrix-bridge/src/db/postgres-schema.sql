-- PostgreSQL schema for PARA Matrix Bridge
-- Must match services/matrix-bridge/src/db.ts (SQLite) exactly

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

CREATE TABLE IF NOT EXISTS community_membership_state (
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  membership_state TEXT NOT NULL,
  roles_json TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
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

CREATE TABLE IF NOT EXISTS community_constitution (
  community_uri TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  rules_json TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  voting_starts_at TIMESTAMP WITH TIME ZONE,
  voting_ends_at TIMESTAMP WITH TIME ZONE,
  decided_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_proposals_community ON proposals(community_uri);
CREATE INDEX IF NOT EXISTS idx_proposals_state ON proposals(state);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at);

CREATE TABLE IF NOT EXISTS votes (
  uri TEXT PRIMARY KEY,
  proposal_uri TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  voter_did TEXT NOT NULL,
  choice TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_uri);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_voter_proposal ON votes(voter_did, proposal_uri);

CREATE TABLE IF NOT EXISTS sortition_proofs (
  id SERIAL PRIMARY KEY,
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  chamber TEXT NOT NULL,
  drand_round INTEGER NOT NULL,
  drand_randomness TEXT NOT NULL,
  hash_input TEXT NOT NULL,
  hash_output TEXT NOT NULL,
  threshold REAL NOT NULL DEFAULT 0.5,
  verified INTEGER NOT NULL DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_moderation_events (
  id SERIAL PRIMARY KEY,
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderation_events_did_community ON chat_moderation_events(did, community_uri);
CREATE INDEX IF NOT EXISTS idx_moderation_events_type_created ON chat_moderation_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_moderation_events_community_created ON chat_moderation_events(community_uri, created_at);

CREATE TABLE IF NOT EXISTS chat_participation_stats (
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  matrix_room_id TEXT,
  message_count INTEGER DEFAULT 0,
  first_message_at TIMESTAMP WITH TIME ZONE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  votes_cast INTEGER DEFAULT 0,
  proposals_created INTEGER DEFAULT 0,
  proposals_reached_quorum INTEGER DEFAULT 0,
  chamber TEXT,
  sortition_proof_id INTEGER,
  is_delegate INTEGER DEFAULT 0,
  is_moderator INTEGER DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
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
  expires_at TIMESTAMP WITH TIME ZONE,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (did, community_uri, badge_type)
);
CREATE INDEX IF NOT EXISTS idx_badges_did_community ON chat_user_badges(did, community_uri);
CREATE INDEX IF NOT EXISTS idx_badges_expires ON chat_user_badges(expires_at);

CREATE TABLE IF NOT EXISTS user_chat_preferences (
  did TEXT PRIMARY KEY,
  show_chat_badges INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matrix_events (
  id SERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  sender TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  origin_server_ts INTEGER NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_matrix_events_room ON matrix_events(room_id, origin_server_ts DESC);
CREATE INDEX IF NOT EXISTS idx_matrix_events_sender ON matrix_events(sender);

CREATE TABLE IF NOT EXISTS room_read_markers (
  did TEXT NOT NULL,
  room_id TEXT NOT NULL,
  last_read_event_id TEXT,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (did, room_id)
);
CREATE INDEX IF NOT EXISTS idx_read_markers_room ON room_read_markers(room_id);

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
  extracted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  is_public INTEGER DEFAULT 0,
  passport_visible INTEGER DEFAULT 0,
  metadata TEXT,
  llm_enriched_at TIMESTAMP WITH TIME ZONE,
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_map_contrib_community ON community_map_contributions(community_uri);
CREATE INDEX IF NOT EXISTS idx_map_contrib_status ON community_map_contributions(status);

CREATE TABLE IF NOT EXISTS community_map_contribution_votes (
  contribution_id TEXT NOT NULL,
  voter_did TEXT NOT NULL,
  vote TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contribution_id, voter_did)
);
CREATE INDEX IF NOT EXISTS idx_map_contrib_votes_contribution ON community_map_contribution_votes(contribution_id);

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

CREATE TABLE IF NOT EXISTS policy_collections (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_policy_collections_did ON policy_collections(did);

CREATE TABLE IF NOT EXISTS policy_collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  policy_uri TEXT NOT NULL,
  policy_data TEXT NOT NULL,
  note TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (collection_id) REFERENCES policy_collections(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON policy_collection_items(collection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_items_unique ON policy_collection_items(collection_id, policy_uri);
