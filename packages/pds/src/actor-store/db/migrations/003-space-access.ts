import { type Kysely, sql } from 'kysely'

// Adapted from upstream 003-space-access (PR #5496): split the single policy
// into independent read/write policies and give each member row read/write
// bits. Keeps upstream's number so the sequence stays adoptable; PARA's own
// migrations are reserved at 900+.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('simplespace_config')
    .addColumn('readPolicy', 'varchar', (col) =>
      col.notNull().defaultTo('member-list'),
    )
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .addColumn('readManagingApp', 'varchar')
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .addColumn('writePolicy', 'varchar', (col) =>
      col.notNull().defaultTo('member-list'),
    )
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .addColumn('writeManagingApp', 'varchar')
    .execute()
  await sql`
    update simplespace_config
    set readPolicy = policy,
        readManagingApp = managingApp,
        writePolicy = policy,
        writeManagingApp = managingApp
  `.execute(db)
  await db.schema
    .alterTable('simplespace_config')
    .dropColumn('policy')
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .dropColumn('managingApp')
    .execute()

  await db.schema
    .alterTable('simplespace_member')
    .addColumn('read', 'integer', (col) => col.notNull().defaultTo(1))
    .execute()
  await db.schema
    .alterTable('simplespace_member')
    .addColumn('write', 'integer', (col) => col.notNull().defaultTo(1))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('simplespace_member').dropColumn('read').execute()
  await db.schema.alterTable('simplespace_member').dropColumn('write').execute()

  await db.schema
    .alterTable('simplespace_config')
    .addColumn('policy', 'varchar', (col) =>
      col.notNull().defaultTo('member-list'),
    )
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .addColumn('managingApp', 'varchar')
    .execute()
  await sql`
    update simplespace_config
    set policy = readPolicy,
        managingApp = readManagingApp
  `.execute(db)
  await db.schema
    .alterTable('simplespace_config')
    .dropColumn('readPolicy')
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .dropColumn('readManagingApp')
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .dropColumn('writePolicy')
    .execute()
  await db.schema
    .alterTable('simplespace_config')
    .dropColumn('writeManagingApp')
    .execute()
}
