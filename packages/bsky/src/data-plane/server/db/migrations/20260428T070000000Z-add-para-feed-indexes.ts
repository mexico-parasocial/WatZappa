import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Index for party-based feed filtering
  await db.schema
    .createIndex('para_post_meta_party_idx')
    .on('para_post_meta')
    .column('party')
    .execute()

  // Composite index for community + postType filtering
  await db.schema
    .createIndex('para_post_meta_community_posttype_idx')
    .on('para_post_meta')
    .columns(['community', 'postType'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('para_post_meta_community_posttype_idx').execute()

  await db.schema.dropIndex('para_post_meta_party_idx').execute()
}
