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

CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  mxid TEXT NOT NULL,
  device_id TEXT NOT NULL,
  friendly_name TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_did ON device_sessions (did);

CREATE TABLE IF NOT EXISTS device_revocations (
  session_id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS as_transactions (
  txn_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (now()::text)
);

CREATE TABLE IF NOT EXISTS event_log (
  seq BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  community_uri TEXT,
  audience_dids_json TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);

CREATE TABLE IF NOT EXISTS community_membership_lease (
  community_uri TEXT NOT NULL,
  mxid TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  PRIMARY KEY (community_uri, mxid)
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

CREATE TABLE IF NOT EXISTS sync_source (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source_id TEXT NOT NULL
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


-- Pending Matrix direct-message requests. The requester consented to share
-- its MXID with the recipient; the row lives only until the recipient
-- accepts or declines, or it expires. ISO-8601 UTC text timestamps.
CREATE TABLE IF NOT EXISTS dm_requests (
  id TEXT PRIMARY KEY,
  requester_did TEXT NOT NULL,
  requester_mxid TEXT NOT NULL,
  -- 'pending' | 'accepted'. Accepting blanks requester_mxid.
  status TEXT NOT NULL DEFAULT 'pending',
  recipient_did TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (requester_did, recipient_did)
);
CREATE INDEX IF NOT EXISTS idx_dm_requests_recipient ON dm_requests (recipient_did);
