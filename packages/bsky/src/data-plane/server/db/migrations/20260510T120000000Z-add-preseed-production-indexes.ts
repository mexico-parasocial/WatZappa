import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_feed_generator_uri
    ON feed_generator(uri)
  `.execute(db)

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cabildeo_vote_creator
    ON cabildeo_vote(creator, cabildeo)
  `.execute(db)

  await sql`
    CREATE INDEX IF NOT EXISTS idx_para_post_party
    ON para_post(party, "indexedAt" DESC)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_para_post_party`.execute(db)
  await sql`DROP INDEX IF EXISTS idx_cabildeo_vote_creator`.execute(db)
  await sql`DROP INDEX IF EXISTS idx_feed_generator_uri`.execute(db)
}
