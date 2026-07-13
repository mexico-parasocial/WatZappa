import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('para_post')
    .addColumn('verifiedPublicFigure', 'boolean')
    .execute()
  await db.schema
    .alterTable('para_post')
    .addColumn('state', 'varchar')
    .execute()
  await db.schema
    .alterTable('para_post')
    .addColumn('districtKey', 'varchar')
    .execute()
  await db.schema
    .alterTable('para_post')
    .addColumn('cabildeoPhase', 'varchar')
    .execute()

  await db.schema
    .createIndex('para_post_verified_public_figure_idx')
    .on('para_post')
    .column('verifiedPublicFigure')
    .execute()
  await db.schema
    .createIndex('para_post_state_idx')
    .on('para_post')
    .column('state')
    .execute()
  await db.schema
    .createIndex('para_post_district_key_idx')
    .on('para_post')
    .column('districtKey')
    .execute()
  await db.schema
    .createIndex('para_post_cabildeo_phase_idx')
    .on('para_post')
    .column('cabildeoPhase')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('para_post_cabildeo_phase_idx').execute()
  await db.schema.dropIndex('para_post_district_key_idx').execute()
  await db.schema.dropIndex('para_post_state_idx').execute()
  await db.schema.dropIndex('para_post_verified_public_figure_idx').execute()

  await db.schema.alterTable('para_post').dropColumn('cabildeoPhase').execute()
  await db.schema.alterTable('para_post').dropColumn('districtKey').execute()
  await db.schema.alterTable('para_post').dropColumn('state').execute()
  await db.schema
    .alterTable('para_post')
    .dropColumn('verifiedPublicFigure')
    .execute()
}
