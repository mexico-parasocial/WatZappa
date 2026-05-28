import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Indexes for cursor-based pagination on community boards
  await db.schema
    .createIndex('para_community_board_createdat_cid_idx')
    .on('para_community_board')
    .columns(['createdAt', 'cid'])
    .execute()

  await db.schema
    .createIndex('para_community_board_indexedat_cid_idx')
    .on('para_community_board')
    .columns(['indexedAt', 'cid'])
    .execute()

  // Index for cursor-based pagination on community memberships
  await db.schema
    .createIndex('para_community_membership_joinedat_cid_idx')
    .on('para_community_membership')
    .columns(['joinedAt', 'cid'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex('para_community_membership_joinedat_cid_idx')
    .execute()

  await db.schema.dropIndex('para_community_board_indexedat_cid_idx').execute()

  await db.schema.dropIndex('para_community_board_createdat_cid_idx').execute()
}
