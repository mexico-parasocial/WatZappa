import type { Kysely } from 'kysely'

/* The CID of a community profile's banner image, for the board views. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_account')
    .addColumn('banner', 'varchar')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_account')
    .dropColumn('banner')
    .execute()
}
