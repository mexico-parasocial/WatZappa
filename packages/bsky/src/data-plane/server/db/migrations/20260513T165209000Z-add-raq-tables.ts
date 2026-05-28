import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('raq_assessment')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('answersJson', 'jsonb')
    .addColumn('resultsJson', 'jsonb')
    .addColumn('compassJson', 'jsonb')
    .addColumn('ideologyJson', 'jsonb')
    .addColumn('secondaryIdeologyJson', 'jsonb')
    .addColumn('partyMatchesJson', 'jsonb')
    .addColumn('isPublic', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('completedAt', 'varchar', (col) => col.notNull())
    .addColumn('version', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('raq_assessment_creator_sort_idx')
    .on('raq_assessment')
    .columns(['creator', 'sortAt'])
    .execute()

  await db.schema
    .createIndex('raq_assessment_is_public_idx')
    .on('raq_assessment')
    .columns(['creator', 'isPublic', 'sortAt'])
    .execute()

  await db.schema
    .createTable('raq_axis_vote')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('axisId', 'varchar', (col) => col.notNull())
    .addColumn('value', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('raq_axis_vote_creator_idx')
    .on('raq_axis_vote')
    .columns(['creator', 'sortAt'])
    .execute()

  await db.schema
    .createIndex('raq_axis_vote_axis_idx')
    .on('raq_axis_vote')
    .columns(['axisId', 'sortAt'])
    .execute()

  await db.schema
    .createTable('raq_proposal')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('text', 'varchar', (col) => col.notNull())
    .addColumn('targetAxis', 'varchar')
    .addColumn('targetCommunity', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addColumn('sortAt', 'varchar', (col) =>
      col.generatedAlwaysAs(sql`least("createdAt", "indexedAt")`).stored(),
    )
    .execute()

  await db.schema
    .createIndex('raq_proposal_creator_idx')
    .on('raq_proposal')
    .columns(['creator', 'sortAt'])
    .execute()

  await db.schema
    .createIndex('raq_proposal_community_idx')
    .on('raq_proposal')
    .columns(['targetCommunity', 'sortAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('raq_proposal').execute()
  await db.schema.dropTable('raq_axis_vote').execute()
  await db.schema.dropTable('raq_assessment').execute()
}
