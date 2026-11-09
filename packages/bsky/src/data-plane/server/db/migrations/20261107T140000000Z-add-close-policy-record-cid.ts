import type { Kysely } from 'kysely'

/**
 * The CID of the cabildeo record in which voting opened. A cabildeo that asks
 * its assembly to decide a protected action only grounds an authority event
 * while its record is still that version: an author who edits the claim after
 * ballots are cast (bait and switch) leaves the cabildeo with no authority.
 * Rows from before this column are null, and a null never grounds anything.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_close_policy')
    .addColumn('recordCid', 'varchar')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_close_policy')
    .dropColumn('recordCid')
    .execute()
}
