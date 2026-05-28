import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('para_community_governance')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('state', 'varchar')
    .addColumn('matterFlairIds', sql`jsonb`)
    .addColumn('policyFlairIds', sql`jsonb`)
    .addColumn('moderatorCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('officialCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('deputyRoleCount', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('lastPublishedAt', 'varchar')
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_governance_community_uri_idx')
    .on('para_community_governance')
    .column('communityUri')
    .execute()

  await db.schema
    .createIndex('para_community_governance_state_idx')
    .on('para_community_governance')
    .column('state')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('para_community_governance').execute()
}
