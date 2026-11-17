import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_community_activity_measurement')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('activityUri', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('metric', 'varchar', (col) => col.notNull())
    .addColumn('value', 'bigint', (col) => col.notNull())
    .addColumn('measuredAt', 'varchar', (col) => col.notNull())
    .addColumn('edited', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('json', 'text', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_community_activity_measurement_activity_idx')
    .on('para_community_activity_measurement')
    .columns(['activityUri', 'measuredAt'])
    .execute()

  await db.schema
    .createTable('para_community_activity_acknowledgement')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('activityUri', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('subjectUri', 'varchar', (col) => col.notNull())
    .addColumn('subjectCid', 'varchar', (col) => col.notNull())
    .addColumn('role', 'varchar', (col) => col.notNull())
    .addColumn('response', 'varchar', (col) => col.notNull())
    .addColumn('occurredAt', 'varchar', (col) => col.notNull())
    .addColumn('edited', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('json', 'text', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_community_activity_acknowledgement_activity_idx')
    .on('para_community_activity_acknowledgement')
    .columns(['activityUri', 'occurredAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_community_activity_acknowledgement').execute()
  await db.schema.dropTable('para_community_activity_measurement').execute()
}
