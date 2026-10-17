import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_activity')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('category', 'varchar', (col) => col.notNull())
    .addColumn('kind', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('startsAt', 'varchar', (col) => col.notNull())
    .addColumn('endsAt', 'varchar')
    .addColumn('json', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_community_activity_community_starts_idx')
    .on('para_community_activity')
    .columns(['communityUri', 'startsAt', 'uri'])
    .execute()
  await db.schema
    .createIndex('para_community_activity_starts_idx')
    .on('para_community_activity')
    .columns(['startsAt', 'uri'])
    .execute()

  await db.schema
    .createTable('para_community_ledger_entry')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('activityUri', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('entryType', 'varchar', (col) => col.notNull())
    .addColumn('amountMinor', 'bigint', (col) => col.notNull())
    .addColumn('currency', 'varchar', (col) => col.notNull())
    .addColumn('occurredAt', 'varchar', (col) => col.notNull())
    .addColumn('json', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_community_ledger_entry_activity_idx')
    .on('para_community_ledger_entry')
    .columns(['activityUri', 'occurredAt'])
    .execute()

  await db.schema
    .createTable('para_community_wiki_page')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('kind', 'varchar', (col) => col.notNull())
    .addColumn('slug', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('pinned', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('sortOrder', 'integer')
    .addColumn('json', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_community_wiki_page_community_idx')
    .on('para_community_wiki_page')
    .columns(['communityUri', 'slug'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_wiki_page').execute()
  await db.schema.dropTable('para_community_ledger_entry').execute()
  await db.schema.dropTable('para_community_activity').execute()
}
