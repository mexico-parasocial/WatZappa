import type { Kysely } from 'kysely'

// OD-9 phase 3: member listings page by when a member last joined, taken from
// the joining event's own `createdAt` so a rebuild reproduces it.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_member_state')
    .addColumn('joinedAt', 'varchar')
    .execute()
  await db.schema
    .createIndex('para_community_member_state_joined_idx')
    .on('para_community_member_state')
    .columns(['community', 'joinedAt', 'did'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('para_community_member_state_joined_idx').execute()
  await db.schema
    .alterTable('para_community_member_state')
    .dropColumn('joinedAt')
    .execute()
}
