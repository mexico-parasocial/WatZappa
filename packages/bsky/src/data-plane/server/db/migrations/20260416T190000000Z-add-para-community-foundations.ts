import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_board')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('rkey', 'varchar', (col) => col.notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'varchar')
    .addColumn('quadrant', 'varchar', (col) => col.notNull())
    .addColumn('slug', 'varchar', (col) => col.notNull())
    .addColumn('delegatesChatId', 'varchar', (col) => col.notNull())
    .addColumn('subdelegatesChatId', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_board_creator_idx')
    .on('para_community_board')
    .column('creator')
    .execute()

  await db.schema
    .createIndex('para_community_board_slug_idx')
    .on('para_community_board')
    .column('slug')
    .execute()

  await db.schema
    .createIndex('para_community_board_quadrant_idx')
    .on('para_community_board')
    .column('quadrant')
    .execute()

  await db.schema
    .createTable('para_community_membership')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('membershipState', 'varchar', (col) => col.notNull())
    .addColumn('roles', 'jsonb')
    .addColumn('source', 'varchar')
    .addColumn('joinedAt', 'varchar', (col) => col.notNull())
    .addColumn('leftAt', 'varchar')
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_membership_creator_idx')
    .on('para_community_membership')
    .column('creator')
    .execute()

  await db.schema
    .createIndex('para_community_membership_community_idx')
    .on('para_community_membership')
    .column('communityUri')
    .execute()

  await db.schema
    .createIndex('para_community_membership_state_idx')
    .on('para_community_membership')
    .column('membershipState')
    .execute()

  await db.schema
    .createIndex('para_community_membership_creator_community_idx')
    .on('para_community_membership')
    .columns(['creator', 'communityUri'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_membership').execute()
  await db.schema.dropTable('para_community_board').execute()
}
