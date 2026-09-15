import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('m8_assurance_challenge')
    .addColumn('nonceHash', 'varchar', (col) => col.primaryKey())
    .addColumn('issuer', 'varchar', (col) => col.notNull())
    .addColumn('did', 'varchar', (col) => col.notNull())
    .addColumn('clientId', 'varchar', (col) => col.notNull())
    .addColumn('dpopJkt', 'varchar', (col) => col.notNull())
    .addColumn('space', 'varchar', (col) => col.notNull())
    .addColumn('audience', 'varchar', (col) => col.notNull())
    .addColumn('issuedAt', 'integer', (col) => col.notNull())
    .addColumn('expiresAt', 'integer', (col) => col.notNull())
    .addColumn('consumedAt', 'integer')
    .execute()
  await db.schema
    .createIndex('m8_assurance_challenge_did_idx')
    .on('m8_assurance_challenge')
    .columns(['did', 'expiresAt'])
    .execute()
  await db.schema
    .createIndex('m8_assurance_challenge_expiry_idx')
    .on('m8_assurance_challenge')
    .column('expiresAt')
    .execute()

  // @NOTE independent of the challenge: one JTI cannot spend a second nonce.
  await db.schema
    .createTable('m8_assurance_receipt')
    .addColumn('issuer', 'varchar', (col) => col.notNull())
    .addColumn('jtiHash', 'varchar', (col) => col.notNull())
    .addColumn('consumedAt', 'integer', (col) => col.notNull())
    .addColumn('retainUntil', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('m8_assurance_receipt_pkey', ['issuer', 'jtiHash'])
    .execute()
  await db.schema
    .createIndex('m8_assurance_receipt_expiry_idx')
    .on('m8_assurance_receipt')
    .column('retainUntil')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('m8_assurance_receipt').execute()
  await db.schema.dropTable('m8_assurance_challenge').execute()
}
