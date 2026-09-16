import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Single-use recovery challenges for stale PARA projections. Only the hash
  // of the challenge secret is persisted; rows are bounded per space and
  // expire, so this table never carries authorization state of its own.
  await db.schema
    .createTable('para_space_policy_challenge')
    .addColumn('space', 'varchar', (col) => col.notNull())
    .addColumn('challengeId', 'varchar', (col) => col.notNull())
    .addColumn('secretHash', 'varchar', (col) => col.notNull())
    .addColumn('sourceIssuer', 'varchar', (col) => col.notNull())
    .addColumn('sourceUri', 'varchar', (col) => col.notNull())
    .addColumn('acceptedSourceVersion', 'integer', (col) => col.notNull())
    .addColumn('acceptedProjectionDigest', 'varchar', (col) => col.notNull())
    .addColumn('maxSourceVersion', 'integer', (col) => col.notNull())
    .addColumn('maxPolicyEpoch', 'integer', (col) => col.notNull())
    .addColumn('issuedAt', 'varchar', (col) => col.notNull())
    .addColumn('expiresAt', 'varchar', (col) => col.notNull())
    .addColumn('consumedAt', 'varchar')
    .addPrimaryKeyConstraint('para_space_policy_challenge_pkey', [
      'space',
      'challengeId',
    ])
    .execute()
  await db.schema
    .createIndex('para_space_policy_challenge_space_idx')
    .on('para_space_policy_challenge')
    .columns(['space', 'expiresAt'])
    .execute()

  // The exact receipt of the latest installed checkpoint. Reconciliation of a
  // lost installation response reads this row; it is never an access grant.
  await db.schema
    .createTable('para_space_policy_checkpoint')
    .addColumn('space', 'varchar', (col) => col.primaryKey())
    .addColumn('sourceIssuer', 'varchar', (col) => col.notNull())
    .addColumn('sourceUri', 'varchar', (col) => col.notNull())
    .addColumn('sourceVersion', 'integer', (col) => col.notNull())
    .addColumn('policyEpoch', 'integer', (col) => col.notNull())
    .addColumn('projectionDigest', 'varchar', (col) => col.notNull())
    .addColumn('challengeId', 'varchar', (col) => col.notNull())
    .addColumn('installedAt', 'varchar', (col) => col.notNull())
    .addColumn('signedCheckpoint', 'text', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_space_policy_checkpoint').execute()
  await db.schema.dropTable('para_space_policy_challenge').execute()
}
