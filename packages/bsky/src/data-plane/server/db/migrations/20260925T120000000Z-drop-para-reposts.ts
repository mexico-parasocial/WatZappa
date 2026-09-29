import { type Kysely, sql } from 'kysely'

/*
 * PARA does not have reposts (see `@atproto/common` para-repost-policy.ts):
 * the PDS refuses them and indexing skips them. This removes the ones indexed
 * before that policy, along with everything derived from them, so no view or
 * count still shows a repost.
 *
 * Deliberately irreversible: `down` cannot restore the deleted rows. The
 * records themselves stay in their authors' repos. An AppView that needs them
 * back re-indexes those repos with PARA_REPOSTS_ENABLED=1.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM notification
    WHERE reason IN ('repost', 'repost-via-repost', 'like-via-repost')
  `.execute(db)
  await sql`DELETE FROM feed_item WHERE type = 'repost'`.execute(db)
  await sql`DELETE FROM repost`.execute(db)
  await sql`UPDATE post_agg SET "repostCount" = 0 WHERE "repostCount" <> 0`.execute(
    db,
  )
  // Keep the planner's statistics honest after a potentially large delete.
  await sql`ANALYZE repost, feed_item, notification`.execute(db)
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Deleted rows cannot be restored; see the note above.
}
