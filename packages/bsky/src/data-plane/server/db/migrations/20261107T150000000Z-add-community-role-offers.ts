import type { Kysely } from 'kysely'

/**
 * A moderator is appointed in three steps: the owner offers, the member
 * accepts, the owner publishes the appointment citing the acceptance. The
 * first two are records of their own, indexed here.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_role_offer')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('role', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_community_role_offer_community_idx')
    .on('para_community_role_offer')
    .columns(['communityUri', 'createdAt', 'uri'])
    .execute()

  await db.schema
    .createTable('para_community_role_acceptance')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('role', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('offerUri', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  // One acceptance per offer: the first to be indexed stands.
  await db.schema
    .createIndex('para_community_role_acceptance_offer_idx')
    .on('para_community_role_acceptance')
    .column('offerUri')
    .unique()
    .execute()
  await db.schema
    .createIndex('para_community_role_acceptance_community_idx')
    .on('para_community_role_acceptance')
    .columns(['communityUri', 'createdAt', 'uri'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_role_acceptance').execute()
  await db.schema.dropTable('para_community_role_offer').execute()
}
