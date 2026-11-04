import type { Kysely } from 'kysely'

// OD-9 community accounts: the fold of the community's own event chain, kept
// in the community's store so `com.para.community.act` decides without the
// AppView. Every store gets the tables; only community stores use them.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('community_state')
    .addColumn('id', 'integer', (col) => col.primaryKey())
    .addColumn('lastSeq', 'integer', (col) => col.notNull())
    .addColumn('lastUri', 'varchar', (col) => col.notNull())
    .addColumn('lastCid', 'varchar', (col) => col.notNull())
    .addColumn('governanceMode', 'varchar', (col) => col.notNull())
    .addColumn('admissionMode', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('community_member')
    .addColumn('did', 'varchar', (col) => col.primaryKey())
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('offices', 'varchar', (col) => col.notNull())
    .addColumn('suspendedUntil', 'varchar')
    .addColumn('since', 'integer', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('community_offer')
    .addColumn('seq', 'integer', (col) => col.primaryKey())
    .addColumn('office', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('issuer', 'varchar', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar', (col) => col.notNull())
    .execute()
  // Each member request backs at most one event.
  await db.schema
    .createTable('community_used_request')
    .addColumn('uri', 'varchar', (col) => col.primaryKey())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('community_used_request').execute()
  await db.schema.dropTable('community_offer').execute()
  await db.schema.dropTable('community_member').execute()
  await db.schema.dropTable('community_state').execute()
}
