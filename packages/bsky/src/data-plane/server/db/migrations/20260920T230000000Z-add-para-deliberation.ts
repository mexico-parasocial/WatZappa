import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_deliberation_statement')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('proposal', 'varchar', (col) => col.notNull())
    .addColumn('community', 'varchar')
    .addColumn('body', 'varchar', (col) => col.notNull())
    .addColumn('stance', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_deliberation_statement_proposal_idx')
    .on('para_deliberation_statement')
    .column('proposal')
    .execute()

  await db.schema
    .createTable('para_deliberation_vote')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('statement', 'varchar', (col) => col.notNull())
    .addColumn('direction', 'varchar', (col) => col.notNull())
    .addColumn('voteNullifier', 'varchar')
    .addColumn('eligibilityProofRef', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('para_deliberation_vote_statement_idx')
    .on('para_deliberation_vote')
    .column('statement')
    .execute()

  // One position per person per argument, when m8 issued a nullifier for it.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS para_deliberation_vote_unique_nullifier
    ON para_deliberation_vote ("statement", "voteNullifier")
    WHERE "voteNullifier" IS NOT NULL
  `.execute(db)

  // Otherwise one per author per argument, so changing your mind replaces
  // rather than accumulates.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS para_deliberation_vote_unique_creator
    ON para_deliberation_vote ("statement", "creator")
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS para_deliberation_vote_unique_creator`.execute(
    db,
  )
  await sql`DROP INDEX IF EXISTS para_deliberation_vote_unique_nullifier`.execute(
    db,
  )
  await db.schema.dropTable('para_deliberation_vote').execute()
  await db.schema.dropTable('para_deliberation_statement').execute()
}
