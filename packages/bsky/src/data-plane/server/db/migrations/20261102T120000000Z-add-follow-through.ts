import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Null means `activity`, the only kind that existed before.
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .addColumn('kind', 'varchar')
    .execute()

  await db.schema
    .createTable('para_follow_through')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('cabildeo', 'varchar', (col) => col.notNull())
    .addColumn('communityUri', 'varchar', (col) => col.notNull())
    .addColumn('optionIndex', 'integer', (col) => col.notNull())
    .addColumn('parent', 'varchar')
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('summary', 'text')
    .addColumn('responsibleDid', 'varchar')
    .addColumn('responsibleLabel', 'varchar')
    .addColumn('dueAt', 'varchar')
    .addColumn('edited', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_follow_through_cabildeo_idx')
    .on('para_follow_through')
    .columns(['cabildeo', 'createdAt', 'uri'])
    .execute()
  await db.schema
    .createIndex('para_follow_through_community_idx')
    .on('para_follow_through')
    .columns(['communityUri', 'createdAt', 'uri'])
    .execute()
  await db.schema
    .createIndex('para_follow_through_parent_idx')
    .on('para_follow_through')
    .column('parent')
    .execute()

  await db.schema
    .createTable('para_follow_through_update')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('cid', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('progress', 'integer')
    .addColumn('note', 'text')
    .addColumn('evidenceUris', 'text', (col) => col.notNull())
    .addColumn('dueAt', 'varchar')
    .addColumn('edited', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('occurredAt', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_follow_through_update_subject_idx')
    .on('para_follow_through_update')
    .columns(['subject', 'occurredAt'])
    .execute()

  await db.schema
    .createTable('para_follow_through_commit')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('kind', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('creator', 'varchar', (col) => col.notNull())
    .addColumn('digest', 'varchar', (col) => col.notNull())
    .addColumn('json', 'text', (col) => col.notNull())
    .addColumn('indexedAt', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('para_follow_through_commit_subject_idx')
    .on('para_follow_through_commit')
    .columns(['subject', 'kind'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_follow_through_commit').execute()
  await db.schema.dropTable('para_follow_through_update').execute()
  await db.schema.dropTable('para_follow_through').execute()
  await db.schema.alterTable('cabildeo_cabildeo').dropColumn('kind').execute()
}
