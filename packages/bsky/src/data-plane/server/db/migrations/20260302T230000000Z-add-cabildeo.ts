import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. cabildeo_cabildeo
  await db.schema
    .createTable('cabildeo_cabildeo')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('communities', 'jsonb')
    .addColumn('flairs', 'jsonb')
    .addColumn('region', 'varchar')
    .addColumn('geoRestricted', 'int2')
    .addColumn('options', 'jsonb', (col) => col.notNull())
    .addColumn('minQuorum', 'integer')
    .addColumn('phase', 'varchar', (col) => col.notNull())
    .addColumn('phaseDeadline', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('cabildeo_cabildeo_community_idx')
    .on('cabildeo_cabildeo')
    .column('community')
    .execute()

  await db.schema
    .createIndex('cabildeo_cabildeo_sort_at_idx')
    .on('cabildeo_cabildeo')
    .column('sortAt')
    .execute()

  // 2. cabildeo_position
  await db.schema
    .createTable('cabildeo_position')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('cabildeo', 'varchar', (col) => col.notNull())
    .addColumn('stance', 'varchar', (col) => col.notNull())
    .addColumn('optionIndex', 'integer')
    .addColumn('text', 'text', (col) => col.notNull())
    .addColumn('compassQuadrant', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('cabildeo_position_cabildeo_idx')
    .on('cabildeo_position')
    .column('cabildeo')
    .execute()

  // 3. cabildeo_delegation
  await db.schema
    .createTable('cabildeo_delegation')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('cabildeo', 'varchar')
    .addColumn('delegateTo', 'varchar', (col) => col.notNull())
    .addColumn('scopeFlairs', 'jsonb')
    .addColumn('reason', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('cabildeo_delegation_delegate_to_idx')
    .on('cabildeo_delegation')
    .column('delegateTo')
    .execute()

  await db.schema
    .createIndex('cabildeo_delegation_creator_idx')
    .on('cabildeo_delegation')
    .column('creator')
    .execute()

  // 4. cabildeo_vote
  await db.schema
    .createTable('cabildeo_vote')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('cabildeo', 'varchar', (col) => col.notNull())
    .addColumn('selectedOption', 'integer')
    .addColumn('isDirect', 'int2', (col) => col.notNull())
    .addColumn('delegatedFrom', 'jsonb')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('cabildeo_vote_cabildeo_idx')
    .on('cabildeo_vote')
    .column('cabildeo')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cabildeo_vote').execute()
  await db.schema.dropTable('cabildeo_delegation').execute()
  await db.schema.dropTable('cabildeo_position').execute()
  await db.schema.dropTable('cabildeo_cabildeo').execute()
}
