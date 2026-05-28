import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('para_community_board')
    .addColumn('governanceMode', 'varchar', (col) =>
      col.defaultTo('hierarchical'),
    )
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('para_community_board')
    .dropColumn('governanceMode')
    .execute()
}
