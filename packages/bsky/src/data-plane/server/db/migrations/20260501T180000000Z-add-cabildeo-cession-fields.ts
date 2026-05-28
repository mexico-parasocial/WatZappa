import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_delegation')
    .alterColumn('delegateTo')
    .dropNotNull()
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .addColumn('mode', 'varchar')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .addColumn('party', 'varchar')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .addColumn('community', 'varchar')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .addColumn('preferredOption', 'integer')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .addColumn('signal', 'integer')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_delegation')
    .dropColumn('signal')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .dropColumn('preferredOption')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .dropColumn('community')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .dropColumn('party')
    .execute()
  await db.schema.alterTable('cabildeo_delegation').dropColumn('mode').execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .alterColumn('delegateTo')
    .setNotNull()
    .execute()
}
