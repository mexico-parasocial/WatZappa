import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // para_post: party and community are filtered in feed generation
  await db.schema
    .createIndex('para_post_party_idx')
    .on('para_post')
    .column('party')
    .execute()

  await db.schema
    .createIndex('para_post_community_idx')
    .on('para_post')
    .column('community')
    .execute()

  // Composite index for time-sorted party feeds (hot, timeline, etc.)
  await db.schema
    .createIndex('para_post_party_sortat_idx')
    .on('para_post')
    .columns(['party', 'sortAt'])
    .execute()

  // Composite index for time-sorted community feeds
  await db.schema
    .createIndex('para_post_community_sortat_idx')
    .on('para_post')
    .columns(['community', 'sortAt'])
    .execute()

  // suggested_feed: queried in order for discovery
  await db.schema
    .createIndex('suggested_feed_order_idx')
    .on('suggested_feed')
    .column('order')
    .execute()

  // feed_generator: para-feed-gens.ts queries by displayName for cleanup
  await db.schema
    .createIndex('feed_generator_displayname_idx')
    .on('feed_generator')
    .column('displayName')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('feed_generator_displayname_idx').execute()

  await db.schema.dropIndex('suggested_feed_order_idx').execute()

  await db.schema.dropIndex('para_post_community_sortat_idx').execute()

  await db.schema.dropIndex('para_post_party_sortat_idx').execute()

  await db.schema.dropIndex('para_post_community_idx').execute()

  await db.schema.dropIndex('para_post_party_idx').execute()
}
