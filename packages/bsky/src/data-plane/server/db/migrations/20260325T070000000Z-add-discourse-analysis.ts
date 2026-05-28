import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. para_discourse_snapshot — time-bucketed aggregate discourse metrics per community
  await db.schema
    .createTable('para_discourse_snapshot')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('bucket', 'varchar', (col) => col.notNull())
    .addColumn('postCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('uniqueAuthors', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('avgConstructiveness', 'real', (col) => col.defaultTo(0))
    .addColumn('semanticVolatility', 'real', (col) => col.defaultTo(0))
    .addColumn('lexicalDiversity', 'real', (col) => col.defaultTo(0))
    .addColumn('polarizationDelta', 'real', (col) => col.defaultTo(0))
    .addColumn('echoChamberIndex', 'real', (col) => col.defaultTo(0))
    .addColumn('topKeywords', 'jsonb')
    .addColumn('sentimentDistribution', 'jsonb')
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_discourse_snapshot_community_idx')
    .on('para_discourse_snapshot')
    .column('community')
    .execute()

  await db.schema
    .createIndex('para_discourse_snapshot_bucket_idx')
    .on('para_discourse_snapshot')
    .column('bucket')
    .execute()

  await db.schema
    .createIndex('para_discourse_snapshot_community_bucket_idx')
    .on('para_discourse_snapshot')
    .columns(['community', 'bucket'])
    .execute()

  // 2. para_topic_cluster — emergent topic groups per community per time bucket
  await db.schema
    .createTable('para_topic_cluster')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('community', 'varchar', (col) => col.notNull())
    .addColumn('bucket', 'varchar', (col) => col.notNull())
    .addColumn('clusterLabel', 'varchar', (col) => col.notNull())
    .addColumn('keywords', 'jsonb')
    .addColumn('postCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('authorCount', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('avgSentiment', 'real', (col) => col.defaultTo(0))
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_topic_cluster_community_bucket_idx')
    .on('para_topic_cluster')
    .columns(['community', 'bucket'])
    .execute()

  // 3. para_sentiment_aggregate — per-post NLP analysis results
  await db.schema
    .createTable('para_sentiment_aggregate')
    .addColumn('postUri', 'varchar', (col) => col.primaryKey())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('community', 'varchar')
    .addColumn('sentimentLabel', 'varchar', (col) => col.notNull())
    .addColumn('sentimentScore', 'real', (col) => col.notNull())
    .addColumn('constructiveness', 'real', (col) => col.defaultTo(0))
    .addColumn('compassQuadrant', 'varchar')
    .addColumn('keywords', 'jsonb')
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('para_sentiment_aggregate_creator_idx')
    .on('para_sentiment_aggregate')
    .column('creator')
    .execute()

  await db.schema
    .createIndex('para_sentiment_aggregate_community_idx')
    .on('para_sentiment_aggregate')
    .column('community')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_sentiment_aggregate').execute()
  await db.schema.dropTable('para_topic_cluster').execute()
  await db.schema.dropTable('para_discourse_snapshot').execute()
}
