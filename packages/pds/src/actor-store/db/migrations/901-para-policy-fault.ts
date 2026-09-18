import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('para_space_policy_fault')
    .addColumn('space', 'varchar', (col) => col.primaryKey())
    .addColumn('sourceIssuer', 'varchar', (col) => col.notNull())
    .addColumn('sourceUri', 'varchar', (col) => col.notNull())
    .addColumn('maxSourceVersion', 'integer', (col) => col.notNull())
    .addColumn('maxPolicyEpoch', 'integer', (col) => col.notNull())
    .addColumn('versionEvidence', 'text', (col) => col.notNull())
    .addColumn('epochEvidence', 'text', (col) => col.notNull())
    .addColumn('observedAt', 'varchar', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('para_space_policy_fault').execute()
}
