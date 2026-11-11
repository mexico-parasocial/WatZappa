import type { Kysely } from 'kysely'

/*
 * OD-9: a `profile.update` event names the presentation it set, as JSON, so a
 * rebuild can check the request that backed it against the same content.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_chain_event')
    .addColumn('profile', 'varchar')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_chain_event')
    .dropColumn('profile')
    .execute()
}
