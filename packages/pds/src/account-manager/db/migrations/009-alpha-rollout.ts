import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('alpha_rollout')
    .addColumn('state', 'varchar', (col) => col.primaryKey())
    .addColumn('totalSlots', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('usedSlots', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('isOpen', 'int2', (col) => col.notNull().defaultTo(0))
    .addColumn('openedAt', 'varchar')
    .execute()

  await db.schema
    .createTable('alpha_invite')
    .addColumn('code', 'varchar', (col) => col.primaryKey())
    .addColumn('state', 'varchar', (col) => col.notNull())
    .addColumn('did', 'varchar')
    .addColumn('createdBy', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('usedAt', 'varchar')
    .execute()
  await db.schema
    .createIndex('alpha_invite_state_idx')
    .on('alpha_invite')
    .column('state')
    .execute()
  await db.schema
    .createIndex('alpha_invite_did_idx')
    .on('alpha_invite')
    .column('did')
    .execute()

  await db.schema
    .createTable('alpha_access_request')
    .addColumn('did', 'varchar', (col) => col.notNull())
    .addColumn('state', 'varchar', (col) => col.notNull())
    .addColumn('inviteCode', 'varchar')
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('createdAt', 'varchar', (col) => col.notNull())
    .addColumn('approvedAt', 'varchar')
    .addPrimaryKeyConstraint('alpha_access_request_pkey', ['did'])
    .execute()
  await db.schema
    .createIndex('alpha_access_request_state_status_idx')
    .on('alpha_access_request')
    .columns(['state', 'status'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('alpha_access_request').execute()
  await db.schema.dropTable('alpha_invite').execute()
  await db.schema.dropTable('alpha_rollout').execute()
}
