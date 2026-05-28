import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Add a GIN index to scopeflairs for expertise-based delegation lookup performance.
  // Note: We use raw sql because Kysely's index builder might not support GIN indexes
  // natively for all backends in this specific version.
  await db.schema
    .createIndex('cabildeo_delegation_scope_flairs_gin_idx')
    .on('cabildeo_delegation')
    .using('gin')
    .column('scopeFlairs')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('cabildeo_delegation_scope_flairs_gin_idx')
    .execute()
}
