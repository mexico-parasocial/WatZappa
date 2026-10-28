import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('space_writer')
    .renameColumn('rev', 'repoRev')
    .execute()
  await db.schema
    .alterTable('space_writer')
    .addColumn('spaceRev', 'varchar', (col) => col.notNull().defaultTo(''))
    .execute()
  // @NOTE Existing writer rows predate the space sequence; their repo revisions
  // give syncers a deterministic bootstrap boundary.
  await sql`update space_writer set spaceRev = repoRev`.execute(db)
  await db.schema
    .createIndex('space_writer_space_rev_idx')
    .on('space_writer')
    .columns(['space', 'spaceRev'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('space_writer_space_rev_idx').execute()
  await db.schema
    .alterTable('space_writer')
    .renameColumn('repoRev', 'rev')
    .execute()
  await db.schema.alterTable('space_writer').dropColumn('spaceRev').execute()
}
