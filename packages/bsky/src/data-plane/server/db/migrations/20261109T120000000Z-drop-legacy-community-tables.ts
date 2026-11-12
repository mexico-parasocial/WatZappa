import type { Kysely } from 'kysely'

/**
 * OD-9 phase 5: a community's membership, offices, relations and moderation
 * come from its chain, so the tables that indexed the records which once
 * carried them are dropped. There was no production community to keep (§5).
 */
const TABLES = [
  'para_community_authority_event',
  'para_community_shared_content_action',
  'para_community_relation',
  'para_community_governance',
  'para_community_membership',
  'para_community_board',
]

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema.dropTable(table).ifExists().execute()
  }
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // @NOTE the records are retired; there is nothing to restore them from.
}
