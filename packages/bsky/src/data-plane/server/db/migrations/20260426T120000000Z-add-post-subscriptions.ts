import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('post_subscription')
    .addColumn('subscriberDid', 'varchar', (col) => col.notNull())
    .addColumn('postUri', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('reply', 'boolean', (col) => col.notNull())
    .addColumn('quote', 'boolean', (col) => col.notNull())
    .addPrimaryKeyConstraint('post_subscription_pkey', [
      'subscriberDid',
      'postUri',
    ])
    .execute()

  await db.schema
    .createIndex('post_subscription_post_uri_idx')
    .on('post_subscription')
    .column('postUri')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('post_subscription').execute()
}
