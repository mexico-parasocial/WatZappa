#!/usr/bin/env tsx
/**
 * Migration script: SQLite → PostgreSQL
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@localhost/para_bridge \
 *     npx tsx src/db/migrate-to-postgres.ts --source /data/bridge.db
 */
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { Pool } from 'pg'

const args = process.argv.slice(2)
const sourceIdx = args.indexOf('--source')
const sourcePath =
  sourceIdx >= 0
    ? args[sourceIdx + 1]
    : process.env.BRIDGE_DB_PATH || '/data/bridge.db'
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required')
  process.exit(1)
}

const sqlite = new Database(sourcePath)
const pg = new Pool({ connectionString: databaseUrl })

async function migrate() {
  console.log(`Migrating ${sourcePath} → PostgreSQL`)

  // Ensure schema exists
  const schemaSql = readFileSync(
    new URL('./postgres-schema.sql', import.meta.url),
    'utf-8',
  )
  await pg.query(schemaSql)
  console.log('Schema created')

  // Helper to migrate a table
  async function migrateTable(
    tableName: string,
    columns: string[],
    opts: { batchSize?: number; transform?: (row: any) => any } = {},
  ) {
    // @NOTE older sources have no pending-device queue until their first upgrade.
    if (
      tableName === 'device_revocations' &&
      !sqlite
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(tableName)
    )
      return
    const { batchSize = 500, transform } = opts
    const rows = sqlite
      .prepare(`SELECT ${columns.join(', ')} FROM ${tableName}`)
      .all()
    if (rows.length === 0) {
      console.log(`  ${tableName}: 0 rows`)
      return
    }

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const insertSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`

    let inserted = 0
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows
        .slice(i, i + batchSize)
        .map(transform || ((r: any) => Object.values(r)))
      const client = await pg.connect()
      try {
        await client.query('BEGIN')
        for (const values of batch) {
          await client.query(insertSql, values)
        }
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
      inserted += batch.length
    }
    console.log(`  ${tableName}: ${inserted} rows migrated`)
  }

  // Migrate tables in dependency order
  await migrateTable('community_space_map', [
    'community_uri',
    'space_id',
    'slug',
    'chamber_mode',
    'chamber_a_room_id',
    'chamber_b_room_id',
    'observer_room_id',
    'created_at',
  ])
  await migrateTable('community_membership_state', [
    'did',
    'community_uri',
    'membership_state',
    'roles_json',
    'updated_at',
  ])
  await migrateTable('device_sessions', [
    'id',
    'did',
    'mxid',
    'device_id',
    'friendly_name',
    'user_agent',
    'created_at',
    'last_seen_at',
    'revoked_at',
  ])
  await migrateTable('device_revocations', [
    'session_id',
    'requested_at',
    'attempts',
  ])
  await migrateTable('sync_log', [
    'id',
    'event_type',
    'community_uri',
    'did',
    'space_id',
    'success',
    'retry_count',
    'error',
    'created_at',
  ])
  await migrateTable('user_push_tokens', [
    'did',
    'expo_push_token',
    'platform',
    'updated_at',
  ])
  await migrateTable('community_constitution', [
    'community_uri',
    'version',
    'rules_json',
    'created_at',
  ])
  await migrateTable('chat_moderation_events', [
    'id',
    'did',
    'community_uri',
    'event_type',
    'reporter_did',
    'report_reason',
    'reported_event_id',
    'reported_message_preview',
    'sanction_type',
    'sanction_duration_minutes',
    'sanctioned_by_did',
    'matrix_room_id',
    'created_at',
  ])
  await migrateTable('chat_user_badges', [
    'did',
    'community_uri',
    'badge_type',
    'severity',
    'visible_in_chat',
    'expires_at',
    'computed_at',
  ])
  await migrateTable('user_chat_preferences', [
    'did',
    'show_chat_badges',
    'updated_at',
  ])
  await migrateTable('matrix_events', [
    'id',
    'room_id',
    'event_id',
    'sender',
    'type',
    'content',
    'origin_server_ts',
  ])
  await migrateTable('room_read_markers', [
    'did',
    'room_id',
    'last_read_event_id',
    'last_read_at',
  ])

  // Reset sequences for tables with SERIAL IDs
  const sequences = [
    'sync_log_id_seq',
    'chat_moderation_events_id_seq',
    'matrix_events_id_seq',
  ]
  for (const seq of sequences) {
    const tableName = seq.replace('_id_seq', '')
    try {
      await pg.query(
        `SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${tableName}), 1))`,
      )
    } catch {
      // Table may not exist or have no rows
    }
  }

  console.log('Migration complete!')
  sqlite.close()
  await pg.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
