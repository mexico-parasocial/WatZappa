import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_policy_outbox')
    .addColumn('artifactKind', 'varchar', (col) =>
      col.notNull().defaultTo('update'),
    )
    .addColumn('challengeId', 'varchar')
    .addColumn('supersededAt', 'bigint')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_policy_outbox')
    .dropColumn('artifactKind')
    .dropColumn('challengeId')
    .dropColumn('supersededAt')
    .execute()
}
