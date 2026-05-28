import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('para_post_post_type_sort_at_idx')
    .on('para_post')
    .columns(['postType', 'sortAt'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .dropIndex('para_post_post_type_sort_at_idx')
    .execute()
}
