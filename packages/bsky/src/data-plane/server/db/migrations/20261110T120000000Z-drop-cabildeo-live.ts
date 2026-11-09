import type { Kysely } from 'kysely'

/**
 * Live cabildeo rooms are retired: nothing reads a host's live session or a
 * participant's presence any more. Dropping the tables drops their indexes.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cabildeo_live_presence').ifExists().execute()
  await db.schema.dropTable('cabildeo_live_session').ifExists().execute()
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // @NOTE presence and sessions were short-lived; there is nothing to restore.
}
