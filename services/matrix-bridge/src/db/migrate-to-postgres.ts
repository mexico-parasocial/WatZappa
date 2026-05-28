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
  await migrateTable('user_matrix_map', ['did', 'matrix_user_id', 'password'])
  await migrateTable('chamber_assignment', ['community_uri', 'did', 'chamber'])
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
  await migrateTable('room_read_markers', [
    'did',
    'room_id',
    'event_id',
    'updated_at',
  ])
  await migrateTable('chat_participation_stats', [
    'did',
    'community_uri',
    'matrix_room_id',
    'message_count',
    'vote_count',
    'proposal_count',
    'is_delegate',
    'is_moderator',
    'chamber',
    'first_seen',
    'last_active',
  ])
  await migrateTable('user_badges', [
    'id',
    'did',
    'community_uri',
    'badge_type',
    'severity',
    'visible_in_chat',
    'created_at',
    'expires_at',
  ])
  await migrateTable('chat_preferences', ['did', 'show_chat_badges'])
  await migrateTable('matrix_events', [
    'id',
    'room_id',
    'event_id',
    'sender',
    'event_type',
    'content',
    'timestamp',
    'processed',
  ])
  await migrateTable('deliberation_cards', [
    'id',
    'community_uri',
    'author_did',
    'title',
    'content',
    'card_type',
    'source_room_id',
    'source_event_id',
    'source_url',
    'extracted_at',
    'is_public',
    'passport_visible',
    'metadata',
    'llm_enriched_at',
    'llm_model',
  ])
  await migrateTable('deliberation_relationships', [
    'id',
    'source_card_id',
    'target_card_id',
    'relationship_type',
    'author_did',
    'created_at',
  ])
  await migrateTable('suggested_relationships', [
    'id',
    'source_card_id',
    'target_card_id',
    'relationship_type',
    'confidence',
    'reason',
    'status',
    'created_at',
  ])
  await migrateTable('card_votes', [
    'id',
    'card_id',
    'voter_did',
    'influence',
    'created_at',
    'updated_at',
  ])
  await migrateTable('extracted_entities', [
    'id',
    'card_id',
    'entity_type',
    'entity_value',
    'start_pos',
    'end_pos',
  ])
  await migrateTable('para_proposals', [
    'uri',
    'community_uri',
    'author_did',
    'title',
    'body',
    'proposal_type',
    'budget_request',
    'state',
    'voting_starts_at',
    'voting_ends_at',
    'decided_at',
    'result',
    'for_votes',
    'against_votes',
    'abstain_votes',
    'created_at',
  ])
  await migrateTable('para_votes', [
    'uri',
    'proposal_uri',
    'community_uri',
    'voter_did',
    'choice',
    'weight',
    'created_at',
  ])
  await migrateTable('para_decisions', [
    'id',
    'proposal_uri',
    'community_uri',
    'result',
    'votes_for',
    'votes_against',
    'votes_abstain',
    'total_members',
    'quorum_required',
    'threshold_required',
    'constitution_version',
    'budget_allocated',
    'created_at',
  ])
  await migrateTable('community_constitutions', [
    'community_uri',
    'version',
    'rules_json',
    'created_at',
  ])
  await migrateTable('sortition_proofs', [
    'id',
    'did',
    'community_uri',
    'chamber',
    'drand_round',
    'drand_randomness',
    'hash_input',
    'hash_output',
    'threshold',
    'verified',
    'timestamp',
  ])
  await migrateTable('moderation_events', [
    'id',
    'did',
    'community_uri',
    'event_type',
    'severity',
    'reason',
    'evidence',
    'reporter_did',
    'related_event_id',
    'expires_at',
    'revoked_at',
    'created_at',
  ])

  // Reset sequences
  await pg.query(
    `SELECT setval('sync_log_id_seq', (SELECT MAX(id) FROM sync_log))`,
  )
  await pg.query(
    `SELECT setval('matrix_events_id_seq', (SELECT MAX(id) FROM matrix_events))`,
  )
  await pg.query(
    `SELECT setval('card_votes_id_seq', (SELECT MAX(id) FROM card_votes))`,
  )
  await pg.query(
    `SELECT setval('extracted_entities_id_seq', (SELECT MAX(id) FROM extracted_entities))`,
  )
  await pg.query(
    `SELECT setval('user_badges_id_seq', (SELECT MAX(id) FROM user_badges))`,
  )
  await pg.query(
    `SELECT setval('para_decisions_id_seq', (SELECT MAX(id) FROM para_decisions))`,
  )
  await pg.query(
    `SELECT setval('sortition_proofs_id_seq', (SELECT MAX(id) FROM sortition_proofs))`,
  )
  await pg.query(
    `SELECT setval('moderation_events_id_seq', (SELECT MAX(id) FROM moderation_events))`,
  )

  console.log('Migration complete!')
  sqlite.close()
  await pg.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
