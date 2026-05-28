import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_open_question_vote')
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
    .addUniqueConstraint('para_open_question_vote_creator_subject_unique', [
      'creator',
      'subject',
    ])
    .execute()

  await db.schema
    .createIndex('para_open_question_vote_subject_idx')
    .on('para_open_question_vote')
    .column('subject')
    .execute()

  await db.schema
    .createIndex('para_open_question_vote_creator_idx')
    .on('para_open_question_vote')
    .column('creator')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_open_question_vote').execute()
}
