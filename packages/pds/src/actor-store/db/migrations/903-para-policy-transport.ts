import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_policy_transport_receipt')
    .addColumn('issuer', 'varchar', (col) => col.notNull())
    .addColumn('jtiHash', 'varchar', (col) => col.notNull())
    .addColumn('consumedAt', 'varchar', (col) => col.notNull())
    .addColumn('retainUntil', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_policy_transport_receipt_pkey', [
      'issuer',
      'jtiHash',
    ])
    .execute()
  await db.schema
    .createIndex('para_policy_transport_receipt_retention_idx')
    .on('para_policy_transport_receipt')
    .columns(['issuer', 'retainUntil'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_policy_transport_receipt').execute()
}
