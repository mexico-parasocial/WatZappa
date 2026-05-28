import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_post')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('text', 'text', (col) => col.notNull())
    .addColumn('replyRoot', 'varchar')
    .addColumn('replyRootCid', 'varchar')
    .addColumn('replyParent', 'varchar')
    .addColumn('replyParentCid', 'varchar')
    .addColumn('langs', 'jsonb')
    .addColumn('tags', 'jsonb')
    .addColumn('flairs', 'jsonb')
    .addColumn('postType', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_post_creator_idx')
    .on('para_post')
    .column('creator')
    .execute()

  await db.schema
    .createIndex('para_post_sort_at_idx')
    .on('para_post')
    .column('sortAt')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_post').execute()
}
