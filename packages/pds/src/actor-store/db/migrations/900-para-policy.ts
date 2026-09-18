import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // The current verified control-plane watermark for a PARA space. Full
  // per-delta audit material lives in para_space_policy_delta below.
  await db.schema
    .createTable('para_space_policy_state')
    .addColumn('space', 'varchar', (col) => col.primaryKey())
    .addColumn('sourceUri', 'varchar', (col) => col.notNull())
    .addColumn('sourceCid', 'varchar', (col) => col.notNull())
    .addColumn('sourceIssuer', 'varchar', (col) => col.notNull())
    .addColumn('sourceVersion', 'integer', (col) => col.notNull())
    .addColumn('policyEpoch', 'integer', (col) => col.notNull())
    .addColumn('projectionDigest', 'varchar', (col) => col.notNull())
    .addColumn('projectionStatus', 'varchar', (col) =>
      col.notNull().defaultTo('ready'),
    )
    .addColumn('issuedAt', 'varchar', (col) => col.notNull())
    .addColumn('receivedAt', 'varchar', (col) => col.notNull())
    .addColumn('signedDelta', 'text', (col) => col.notNull())
    .execute()

  // An append-only receipt for every accepted, verified projection. Its digest
  // chains a per-space stream so a retry cannot substitute a different parsed
  // member payload for an already accepted signed delta.
  await db.schema
    .createTable('para_space_policy_delta')
    .addColumn('space', 'varchar', (col) => col.notNull())
    .addColumn('sourceVersion', 'integer', (col) => col.notNull())
    .addColumn('kind', 'varchar', (col) => col.notNull())
    .addColumn('sourceUri', 'varchar', (col) => col.notNull())
    .addColumn('sourceCid', 'varchar', (col) => col.notNull())
    .addColumn('sourceIssuer', 'varchar', (col) => col.notNull())
    .addColumn('policyEpoch', 'integer', (col) => col.notNull())
    .addColumn('previousDeltaDigest', 'varchar')
    .addColumn('projectionDigest', 'varchar', (col) => col.notNull())
    .addColumn('issuedAt', 'varchar', (col) => col.notNull())
    .addColumn('receivedAt', 'varchar', (col) => col.notNull())
    .addColumn('signedDelta', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_space_policy_delta_pkey', [
      'space',
      'sourceVersion',
    ])
    .execute()

  // Current membership and role material. Rows are retained for removed and
  // blocked members so a later policy decision can distinguish denial states.
  await db.schema
    .createTable('para_space_policy_member')
    .addColumn('space', 'varchar', (col) => col.notNull())
    .addColumn('did', 'varchar', (col) => col.notNull())
    .addColumn('membershipState', 'varchar', (col) => col.notNull())
    .addColumn('roles', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('roleAssignments', 'text', (col) =>
      col.notNull().defaultTo('[]'),
    )
    .addColumn('sourceVersion', 'integer', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar', (col) => col.notNull())
    .addPrimaryKeyConstraint('para_space_policy_member_pkey', ['space', 'did'])
    .execute()

  await db.schema
    .createIndex('para_space_policy_member_state_idx')
    .on('para_space_policy_member')
    .columns(['space', 'membershipState'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_space_policy_member').execute()
  await db.schema.dropTable('para_space_policy_delta').execute()
  await db.schema.dropTable('para_space_policy_state').execute()
}
