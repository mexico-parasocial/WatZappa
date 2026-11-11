import { type Kysely, sql } from 'kysely'
import { migrateLegacyPolicy } from '../../../simplespace/migrate-policy.js'
import type { SimplespaceConfig } from '../schema/simplespace-config.js'

// Keep legacy tables until the old routes have been retired; both are updated
// atomically while the new policy routes are introduced.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async (txn) => {
    const { rows } =
      await sql<SimplespaceConfig>`select * from simplespace_config`.execute(
        txn,
      )
    const policies = rows.map((config) => ({
      uri: config.uri,
      policyJson: JSON.stringify(migrateLegacyPolicy(config)),
    }))
    await txn.schema
      .createTable('space_policy')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('policyJson', 'text', (col) => col.notNull())
      .execute()
    for (const policy of policies) {
      await sql`insert into space_policy (uri, policyJson) values (${policy.uri}, ${policy.policyJson})`.execute(
        txn,
      )
    }
  })
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('space_policy').execute()
}
