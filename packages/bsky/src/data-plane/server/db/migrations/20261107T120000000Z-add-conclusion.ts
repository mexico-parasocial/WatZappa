import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_conclusion')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('cabildeo', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('text', 'text', (col) => col.notNull())
    .addColumn('cited', 'text', (col) => col.notNull())
    .addColumn('followUp', 'varchar')
    .addColumn('edited', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_conclusion_cabildeo_idx')
    .on('para_conclusion')
    .columns(['cabildeo', 'createdAt', 'uri'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_conclusion').execute()
}
