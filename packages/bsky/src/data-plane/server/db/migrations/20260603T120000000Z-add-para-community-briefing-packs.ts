import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_briefing_pack')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('rkey', 'varchar', (col) => col.notNull())
    .addColumn('packType', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('party', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('summary', 'text', (col) => col.notNull())
    .addColumn('cabildeoUris', 'jsonb', (col) => col.notNull())
    .addColumn('civicTreeCardIds', 'jsonb', (col) => col.notNull())
    .addColumn('evidenceUris', 'jsonb', (col) => col.notNull())
    .addColumn('sembleCollectionUri', 'varchar')
    .addColumn('marginCollectionUri', 'varchar')
    .addColumn('obsidianExportUri', 'varchar')
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('createdBy', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_briefing_pack_community_idx')
    .on('para_community_briefing_pack')
    .column('communityUri')
    .execute()

  await db.schema
    .createIndex('para_community_briefing_pack_party_idx')
    .on('para_community_briefing_pack')
    .column('party')
    .execute()

  await db.schema
    .createIndex('para_community_briefing_pack_status_idx')
    .on('para_community_briefing_pack')
    .column('status')
    .execute()

  await db.schema
    .createIndex('para_community_briefing_pack_updated_idx')
    .on('para_community_briefing_pack')
    .column('updatedAt')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_briefing_pack').execute()
}
