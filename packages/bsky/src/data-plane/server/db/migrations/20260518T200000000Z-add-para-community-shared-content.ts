import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_shared_content')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('rkey', 'varchar', (col) => col.notNull())
    .addColumn('subjectUri', 'varchar', (col) => col.notNull())
    .addColumn('subjectCid', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('contentType', 'varchar', (col) => col.notNull())
    .addColumn('sharedBy', 'varchar', (col) => col.notNull())
    .addColumn('note', 'varchar')
    .addColumn('visibility', 'varchar')
    .addColumn('sourceApp', 'varchar')
    .addColumn('embedContext', 'jsonb')
    .addColumn('pinned', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('sortRank', 'integer')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_shared_content_community_idx')
    .on('para_community_shared_content')
    .columns(['communityUri', 'createdAt', 'cid'])
    .execute()

  await db.schema
    .createIndex('para_community_shared_content_subject_idx')
    .on('para_community_shared_content')
    .columns(['communityUri', 'subjectUri'])
    .unique()
    .execute()

  await db.schema
    .createIndex('para_community_shared_content_creator_idx')
    .on('para_community_shared_content')
    .column('creator')
    .execute()

  await db.schema
    .createTable('para_community_shared_content_action')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('rkey', 'varchar', (col) => col.notNull())
    .addColumn('sharedContentUri', 'varchar', (col) => col.notNull())
    .addColumn('sharedContentCid', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('action', 'varchar', (col) => col.notNull())
    .addColumn('note', 'varchar')
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_shared_content_action_share_idx')
    .on('para_community_shared_content_action')
    .columns(['sharedContentUri', 'createdAt', 'cid'])
    .execute()

  await db.schema
    .createIndex('para_community_shared_content_action_community_idx')
    .on('para_community_shared_content_action')
    .columns(['communityUri', 'createdAt', 'cid'])
    .execute()

  await db.schema
    .createIndex('para_community_shared_content_action_creator_idx')
    .on('para_community_shared_content_action')
    .column('creator')
    .execute()

  await db.schema
    .createTable('para_community_relation')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('rkey', 'varchar', (col) => col.notNull())
    .addColumn('parentCommunityUri', 'varchar', (col) => col.notNull())
    .addColumn('childCommunityUri', 'varchar', (col) => col.notNull())
    .addColumn('relation', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_community_relation_parent_idx')
    .on('para_community_relation')
    .columns(['parentCommunityUri', 'createdAt', 'cid'])
    .execute()

  await db.schema
    .createIndex('para_community_relation_child_idx')
    .on('para_community_relation')
    .columns(['childCommunityUri', 'createdAt', 'cid'])
    .execute()

  await db.schema
    .createIndex('para_community_relation_pair_idx')
    .on('para_community_relation')
    .columns(['parentCommunityUri', 'childCommunityUri', 'relation'])
    .unique()
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_relation').execute()
  await db.schema.dropTable('para_community_shared_content_action').execute()
  await db.schema.dropTable('para_community_shared_content').execute()
}
