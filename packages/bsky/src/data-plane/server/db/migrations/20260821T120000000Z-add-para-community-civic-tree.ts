import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  /*
   * Cards are the nodes of a community civic tree. They are appview-owned
   * rather than repo records: a card only exists once the community has
   * approved the contribution that proposed it, so there is no user repo that
   * can be its authoritative home.
   */
  await db.schema
    .createTable('para_community_civic_tree_card')
    .addColumn('id', 'varchar', (col) => col.primaryKey())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('authorDid', 'varchar', (col) => col.notNull())
    .addColumn('cardType', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('content', 'varchar')
    .addColumn('sourceUri', 'varchar')
    .addColumn('sourceUrl', 'varchar')
    .addColumn('metadata', 'varchar')
    .addColumn('stance', 'varchar')
    .addColumn('compassQuadrant', 'varchar')
    .addColumn('influence', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('voteCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('contributionId', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_civic_tree_card_community_idx')
    .on('para_community_civic_tree_card')
    .columns(['communityUri', 'createdAt', 'id'])
    .execute()

  await db.schema
    .createIndex('para_community_civic_tree_card_author_idx')
    .on('para_community_civic_tree_card')
    .column('authorDid')
    .execute()

  await db.schema
    .createTable('para_community_civic_tree_relationship')
    .addColumn('id', 'varchar', (col) => col.primaryKey())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('authorDid', 'varchar', (col) => col.notNull())
    .addColumn('sourceCardId', 'varchar', (col) => col.notNull())
    .addColumn('targetCardId', 'varchar', (col) => col.notNull())
    .addColumn('relationshipType', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_civic_tree_relationship_community_idx')
    .on('para_community_civic_tree_relationship')
    .columns(['communityUri', 'createdAt', 'id'])
    .execute()

  /*
   * A pair may only be related once in a given direction; re-asserting an
   * existing edge with a different type is an update, not a second edge.
   */
  await db.schema
    .createIndex('para_community_civic_tree_relationship_pair_idx')
    .on('para_community_civic_tree_relationship')
    .columns(['sourceCardId', 'targetCardId'])
    .unique()
    .execute()

  /*
   * Contributions are proposed cards under review. approveCount/rejectCount
   * are denormalized from the vote table so listing a review queue does not
   * need a per-row aggregate.
   */
  await db.schema
    .createTable('para_community_civic_tree_contribution')
    .addColumn('id', 'varchar', (col) => col.primaryKey())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('authorDid', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('content', 'varchar')
    .addColumn('sourceUri', 'varchar')
    .addColumn('sourceUrl', 'varchar')
    .addColumn('sourceType', 'varchar', (col) => col.notNull())
    .addColumn('metadata', 'varchar')
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('pending'))
    .addColumn('approvedCardId', 'varchar')
    .addColumn('approveCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('rejectCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('decidedAt', 'varchar')
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_civic_tree_contribution_queue_idx')
    .on('para_community_civic_tree_contribution')
    .columns(['communityUri', 'status', 'createdAt', 'id'])
    .execute()

  await db.schema
    .createIndex('para_community_civic_tree_contribution_author_idx')
    .on('para_community_civic_tree_contribution')
    .column('authorDid')
    .execute()

  await db.schema
    .createTable('para_community_civic_tree_contribution_vote')
    .addColumn('contributionId', 'varchar', (col) => col.notNull())
    .addColumn('voterDid', 'varchar', (col) => col.notNull())
    .addColumn('vote', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_community_civic_tree_contribution_vote_pkey', [
      'contributionId',
      'voterDid',
    ])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropTable('para_community_civic_tree_contribution_vote')
    .execute()
  await db.schema
    .dropTable('para_community_civic_tree_contribution')
    .execute()
  await db.schema
    .dropTable('para_community_civic_tree_relationship')
    .execute()
  await db.schema.dropTable('para_community_civic_tree_card').execute()
}
