import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Helps getCommunityPostCounts filter by community before regex normalization
  await db.schema
    .createIndex('para_post_meta_community_idx')
    .on('para_post_meta')
    .column('community')
    .execute()

  // Optimizes getVoteCounts GROUP BY creator
  await db.schema
    .createIndex('cabildeo_vote_creator_idx')
    .on('cabildeo_vote')
    .column('creator')
    .execute()

  // Composite index for membership filtering (communityUri + membershipState)
  // Used by selectMembers and other community-scoped membership queries
  await db.schema
    .createIndex('para_community_membership_community_state_idx')
    .on('para_community_membership')
    .columns(['communityUri', 'membershipState'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex('para_community_membership_community_state_idx')
    .execute()

  await db.schema.dropIndex('cabildeo_vote_creator_idx').execute()

  await db.schema.dropIndex('para_post_meta_community_idx').execute()
}
