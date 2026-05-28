import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .addColumn('voteVisibility', 'varchar', (col) =>
      col.notNull().defaultTo('public'),
    )
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .dropColumn('voteVisibility')
    .execute()
}
