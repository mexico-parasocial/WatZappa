import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('raq_proposal_vote')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('value', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('raq_proposal_vote_subject_idx')
    .on('raq_proposal_vote')
    .columns(['subject', 'sortAt'])
    .execute()

  await db.schema
    .createIndex('raq_proposal_vote_creator_idx')
    .on('raq_proposal_vote')
    .columns(['creator', 'sortAt'])
    .execute()

  await db.schema
    .createTable('raq_proposal_answer')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('value', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('raq_proposal_answer_subject_idx')
    .on('raq_proposal_answer')
    .columns(['subject', 'sortAt'])
    .execute()

  await db.schema
    .createIndex('raq_proposal_answer_creator_idx')
    .on('raq_proposal_answer')
    .columns(['creator', 'sortAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('raq_proposal_answer').execute()
  await db.schema.dropTable('raq_proposal_vote').execute()
}
