import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_membership')
    .addColumn('roleAssignments', 'jsonb')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_community_membership')
    .dropColumn('roleAssignments')
    .execute()
}
