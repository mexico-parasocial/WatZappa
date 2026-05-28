-- PostgreSQL schema for PARA Matrix Bridge
-- Run this before migrating from SQLite

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

CREATE TABLE IF NOT EXISTS room_read_markers (
  did TEXT NOT NULL,
  room_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (did, room_id)
);

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

CREATE TABLE IF NOT EXISTS user_badges (
  id SERIAL PRIMARY KEY,
  did TEXT NOT NULL,
  community_uri TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  severity TEXT,
  visible_in_chat INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS community_constitutions (
  community_uri TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  rules_json TEXT NOT NULL,
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
