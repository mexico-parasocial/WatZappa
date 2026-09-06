import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .addColumn('latE7', 'integer')
    .execute()

  await db.schema
    .alterTable('cabildeo_cabildeo')
    .addColumn('lngE7', 'integer')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('cabildeo_cabildeo').dropColumn('lngE7').execute()

  await db.schema.alterTable('cabildeo_cabildeo').dropColumn('latE7').execute()
}
