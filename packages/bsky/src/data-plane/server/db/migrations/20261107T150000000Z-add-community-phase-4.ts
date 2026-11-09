import type { Kysely } from 'kysely'

/*
 * OD-9 phase 4. Chain events gain the parameters of the new actions, and the
 * fold gains the state those actions produce outside membership: the
 * moderation state of shared items, which briefing-pack version is published,
 * and each community's half of a relation.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_chain_event')
    .addColumn('sanction', 'varchar')
    .execute()
  await db.schema
    .alterTable('para_community_chain_event')
    .addColumn('target', 'varchar')
    .execute()
  await db.schema
    .alterTable('para_community_chain_event')
    .addColumn('targetCid', 'varchar')
    .execute()

  // Newest event by `seq` wins for each flag; neither time enters into it.
  await db.schema
    .createTable('para_community_content_state')
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('target', 'varchar', (col) => col.notNull())
    .addColumn('hidden', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('pinned', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('hiddenAt', 'varchar')
    .addColumn('hiddenBy', 'varchar')
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_community_content_state_pkey', [
      'community',
      'target',
    ])
    .execute()

  await db.schema
    .createTable('para_community_briefing_state')
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('target', 'varchar', (col) => col.notNull())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('state', 'varchar', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('actor', 'varchar', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_community_briefing_state_pkey', [
      'community',
      'target',
    ])
    .execute()

  await db.schema
    .createTable('para_community_relation_half')
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('other', 'varchar', (col) => col.notNull())
    .addColumn('half', 'varchar', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('eventUri', 'varchar', (col) => col.notNull())
    .addColumn('eventCid', 'varchar', (col) => col.notNull())
    .addColumn('actor', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_community_relation_half_pkey', [
      'community',
      'other',
    ])
    .execute()
  await db.schema
    .createIndex('para_community_relation_half_other_idx')
    .on('para_community_relation_half')
    .columns(['other', 'half'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_relation_half').execute()
  await db.schema.dropTable('para_community_briefing_state').execute()
  await db.schema.dropTable('para_community_content_state').execute()
  for (const column of ['targetCid', 'target', 'sanction']) {
    await db.schema
      .alterTable('para_community_chain_event')
      .dropColumn(column)
      .execute()
  }
}
