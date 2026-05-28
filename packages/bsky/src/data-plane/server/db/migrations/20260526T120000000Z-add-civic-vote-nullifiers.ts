import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_vote')
    .addColumn('voteNullifier', 'varchar')
    .execute()
  await db.schema
    .alterTable('cabildeo_vote')
    .addColumn('eligibilityProofRef', 'varchar')
    .execute()

  await db.schema
    .alterTable('para_policy_vote')
    .addColumn('voteNullifier', 'varchar')
    .execute()
  await db.schema
    .alterTable('para_policy_vote')
    .addColumn('eligibilityProofRef', 'varchar')
    .execute()

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cabildeo_vote_unique_nullifier
    ON cabildeo_vote ("cabildeo", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS para_policy_vote_unique_nullifier
    ON para_policy_vote ("subjectType", "subject", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS para_policy_vote_unique_nullifier`.execute(db)
  await sql`DROP INDEX IF EXISTS cabildeo_vote_unique_nullifier`.execute(db)
  await db.schema.alterTable('para_policy_vote').dropColumn('eligibilityProofRef').execute()
  await db.schema.alterTable('para_policy_vote').dropColumn('voteNullifier').execute()
  await db.schema.alterTable('cabildeo_vote').dropColumn('eligibilityProofRef').execute()
  await db.schema.alterTable('cabildeo_vote').dropColumn('voteNullifier').execute()
}
