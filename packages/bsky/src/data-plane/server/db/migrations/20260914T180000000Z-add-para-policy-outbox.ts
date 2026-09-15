import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_policy_publication')
    .addColumn('space', 'varchar', (col) => col.primaryKey())
    .addColumn('issuer', 'varchar', (col) => col.notNull())
    .addColumn('audience', 'varchar', (col) => col.notNull())
    .addColumn('sourceUri', 'varchar', (col) => col.notNull())
    .addColumn('sourceVersion', 'bigint', (col) => col.notNull())
    .addColumn('policyEpoch', 'bigint', (col) => col.notNull())
    .addColumn('projectionDigest', 'varchar')
    .addColumn('acknowledgedVersion', 'bigint', (col) => col.notNull())
    .addColumn('deliveryStatus', 'varchar', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('para_policy_outbox')
    .addColumn('space', 'varchar', (col) =>
      col.notNull().references('para_policy_publication.space'),
    )
    .addColumn('sourceVersion', 'bigint', (col) => col.notNull())
    .addColumn('policyEpoch', 'bigint', (col) => col.notNull())
    .addColumn('eventId', 'varchar', (col) => col.notNull())
    .addColumn('inputDigest', 'varchar', (col) => col.notNull())
    .addColumn('assertion', 'text', (col) => col.notNull())
    .addColumn('projectionDigest', 'varchar', (col) => col.notNull())
    .addColumn('expiresAt', 'bigint', (col) => col.notNull())
    .addColumn('leaseTokenHash', 'varchar')
    .addColumn('leaseUntil', 'bigint')
    .addColumn('acknowledgedAt', 'bigint')
    .addPrimaryKeyConstraint('para_policy_outbox_pkey', [
      'space',
      'sourceVersion',
    ])
    .addUniqueConstraint('para_policy_outbox_event_idx', ['space', 'eventId'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_policy_outbox').execute()
  await db.schema.dropTable('para_policy_publication').execute()
}
