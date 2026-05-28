import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    'raq_axis_vote',
    'raq_proposal_vote',
    'para_qvld_vote',
    'para_qvld_intensity',
    'para_qvld_deliberation_vote',
    'para_open_question_vote',
  ]) {
    await db.schema.alterTable(table).addColumn('voteNullifier', 'varchar').execute()
    await db.schema
      .alterTable(table)
      .addColumn('eligibilityProofRef', 'varchar')
      .execute()
  }

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS raq_axis_vote_unique_nullifier
    ON raq_axis_vote ("axisId", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS raq_proposal_vote_unique_nullifier
    ON raq_proposal_vote ("subject", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS para_qvld_vote_unique_nullifier
    ON para_qvld_vote ("proposal", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS para_qvld_intensity_unique_nullifier
    ON para_qvld_intensity ("proposal", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS para_qvld_deliberation_vote_unique_nullifier
    ON para_qvld_deliberation_vote ("statement", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS para_open_question_vote_unique_nullifier
    ON para_open_question_vote ("subject", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS para_open_question_vote_unique_nullifier`.execute(db)
  await sql`DROP INDEX IF EXISTS para_qvld_deliberation_vote_unique_nullifier`.execute(db)
  await sql`DROP INDEX IF EXISTS para_qvld_intensity_unique_nullifier`.execute(db)
  await sql`DROP INDEX IF EXISTS para_qvld_vote_unique_nullifier`.execute(db)
  await sql`DROP INDEX IF EXISTS raq_proposal_vote_unique_nullifier`.execute(db)
  await sql`DROP INDEX IF EXISTS raq_axis_vote_unique_nullifier`.execute(db)

  for (const table of [
    'para_open_question_vote',
    'para_qvld_deliberation_vote',
    'para_qvld_intensity',
    'para_qvld_vote',
    'raq_proposal_vote',
    'raq_axis_vote',
  ]) {
    await db.schema.alterTable(table).dropColumn('eligibilityProofRef').execute()
    await db.schema.alterTable(table).dropColumn('voteNullifier').execute()
  }
}
