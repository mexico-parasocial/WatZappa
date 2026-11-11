import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'
import type { QueryResult } from 'pg'

// cjs-module-lexer cannot statically enumerate pg's named exports, so the
// compiled ESM build crashes on `import { Pool } from 'pg'` at instantiation.
// Take the default and destructure instead.
const { Pool } = pg

/** Lifecycle, connection handle and shared query helpers. */
export class PgBase {
  /** pg deliberately returns int8 as text. Convert only bounded local values. */
  protected safeInteger(value: string | number): number {
    if (typeof value === 'string' && !/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new Error('Invalid PostgreSQL counter or cursor')
    }
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new Error(
        'PostgreSQL counter or cursor exceeds the safe integer range',
      )
    }
    return number
  }
  private transactionContext = new AsyncLocalStorage<{
    client: pg.PoolClient
    active: boolean
  }>()
  protected pool: pg.Pool

  protected initPromise: Promise<void>

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 20 })
    this.initPromise = this.init()
  }

  protected async init(): Promise<void> {
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

      CREATE INDEX IF NOT EXISTS idx_device_sessions_did ON device_sessions(did);

      CREATE TABLE IF NOT EXISTS device_revocations (
        session_id TEXT PRIMARY KEY,
        requested_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS matrix_poll_cursors (
        room_id TEXT PRIMARY KEY,
        cursor TEXT NOT NULL
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

      -- v1 linkage table, deleted by CD-M1 (see the sqlite init comment).
      DROP TABLE IF EXISTS user_matrix_map;

      -- DID-free membership lease (CD-M6, see the sqlite init comment).
      CREATE TABLE IF NOT EXISTS community_membership_lease (
        community_uri TEXT NOT NULL,
        mxid TEXT NOT NULL,
        last_verified_at TEXT NOT NULL,
        PRIMARY KEY (community_uri, mxid)
      );

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
        cursor BIGINT NOT NULL
      );
      ALTER TABLE sync_cursor ALTER COLUMN cursor TYPE BIGINT;

      CREATE TABLE IF NOT EXISTS sync_source (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        source_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS push_delivery (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        state TEXT NOT NULL,
        owner TEXT NOT NULL,
        lease_until BIGINT NOT NULL,
        receipt_id TEXT,
        created_at BIGINT NOT NULL,
        check_after BIGINT NOT NULL,
        error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_push_delivery_receipts ON push_delivery(state, check_after);
      CREATE INDEX IF NOT EXISTS idx_push_delivery_retention ON push_delivery(created_at);

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

      -- Pending Matrix DM requests (see db/records.ts DmRequest).
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

      CREATE TABLE IF NOT EXISTS user_chat_preferences (
        did TEXT PRIMARY KEY,
        show_chat_badges INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

      CREATE TABLE IF NOT EXISTS matrix_events (
        id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        sender TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        origin_server_ts BIGINT NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      ALTER TABLE matrix_events ALTER COLUMN origin_server_ts TYPE BIGINT;
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

    `)
  }

  protected async query(text: string, params?: any[]): Promise<QueryResult> {
    await this.initPromise
    const context = this.transactionContext.getStore()
    return (context?.active ? context.client : this.pool).query(text, params)
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore()?.active) return work()
    await this.initPromise
    const client = await this.pool.connect()
    const context = { client, active: true }
    try {
      await client.query('BEGIN')
      // @NOTE serialize ingestion, event sequence allocation and role mutations.
      await client.query('SELECT pg_advisory_xact_lock(72419301)')
      const result = await this.transactionContext.run(context, work)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      context.active = false
      client.release()
    }
  }

  protected async queryOne<T = any>(
    text: string,
    params?: any[],
  ): Promise<T | undefined> {
    const result = await this.query(text, params)
    return result.rows[0] as T | undefined
  }

  protected async queryAll<T = any>(
    text: string,
    params?: any[],
  ): Promise<T[]> {
    const result = await this.query(text, params)
    return result.rows as T[]
  }

  protected async run(text: string, params?: any[]): Promise<void> {
    await this.query(text, params)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
