import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_admission')
    .addColumn('uri', 'varchar', (col) => col.notNull().unique())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('memberDid', 'varchar', (col) => col.notNull())
    .addColumn('state', 'varchar', (col) => col.notNull())
    .addColumn('decidedAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_community_admission_pkey', [
      'communityUri',
      'memberDid',
    ])
    .execute()
  await db.schema
    .createIndex('para_community_admission_lookup_idx')
    .on('para_community_admission')
    .columns(['communityUri', 'memberDid', 'indexedAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_admission').execute()
}
