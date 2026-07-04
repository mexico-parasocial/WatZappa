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
  await migrateTable('community_membership_state', [
    'did',
    'community_uri',
    'membership_state',
    'roles_json',
    'updated_at',
  ])
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
  await migrateTable('community_constitution', [
    'community_uri',
    'version',
    'rules_json',
    'created_at',
  ])
  await migrateTable('proposals', [
    'uri',
    'community_uri',
    'author_did',
    'title',
    'body',
    'proposal_type',
    'budget_request',
    'state',
    'votes_for',
    'votes_against',
    'votes_abstain',
    'created_at',
    'voting_starts_at',
    'voting_ends_at',
    'decided_at',
  ])
  await migrateTable('votes', [
    'uri',
    'proposal_uri',
    'community_uri',
    'voter_did',
    'choice',
    'weight',
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
  await migrateTable('sortition_runs', [
    'id',
    'cabildeo_uri',
    'community_uri',
    'created_by_did',
    'assembly_size',
    'eligibility_filter',
    'drand_round',
    'drand_randomness',
    'threshold',
    'eligible_count',
    'selected_count',
    'status',
    'config_record_json',
    'created_at',
    'processed_at',
  ])
  await migrateTable('sortition_candidates', [
    'run_id',
    'did',
    'community_uri',
    'cabildeo_uri',
    'hash_input',
    'hash_output',
    'hash_value',
    'threshold',
    'selected',
    'created_at',
  ])
  await migrateTable('decisions', [
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
  await migrateTable('chat_participation_stats', [
    'did',
    'community_uri',
    'matrix_room_id',
    'message_count',
    'first_message_at',
    'last_message_at',
    'votes_cast',
    'proposals_created',
    'proposals_reached_quorum',
    'chamber',
    'sortition_proof_id',
    'is_delegate',
    'is_moderator',
    'joined_at',
    'updated_at',
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
  await migrateTable('community_map_contributions', [
    'id',
    'community_uri',
    'author_did',
    'title',
    'content',
    'source_url',
    'source_type',
    'metadata',
    'status',
    'approved_card_id',
    'created_at',
    'decided_at',
  ])
  await migrateTable('community_map_contribution_votes', [
    'contribution_id',
    'voter_did',
    'vote',
    'created_at',
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
  await migrateTable('policy_collections', [
    'id',
    'did',
    'name',
    'description',
    'color',
    'created_at',
    'updated_at',
  ])
  await migrateTable('policy_collection_items', [
    'id',
    'collection_id',
    'policy_uri',
    'policy_data',
    'note',
    'position',
    'created_at',
  ])

  // Reset sequences for tables with SERIAL IDs
  const sequences = [
    'sync_log_id_seq',
    'sortition_proofs_id_seq',
    'decisions_id_seq',
    'chat_moderation_events_id_seq',
    'matrix_events_id_seq',
    'card_votes_id_seq',
    'extracted_entities_id_seq',
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
