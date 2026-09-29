import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('cabildeo_delegation')
    .addColumn('eligibilityProofRef', 'varchar')
    .execute()
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .addColumn('optionEffectivePowerMicros', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .execute()
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .addColumn('effectiveTotalPowerMicros', 'bigint', (col) =>
      col.notNull().defaultTo(0),
    )
    .execute()
  await db.schema
    .createTable('cabildeo_final_tally')
    .addColumn('cabildeo', 'varchar', (col) => col.primaryKey())
    .addColumn('closedAt', 'varchar', (col) => col.notNull())
    .addColumn('finalizedAt', 'varchar', (col) => col.notNull())
    .addColumn('summary', 'jsonb', (col) => col.notNull())
    .addColumn('acceptedInputs', 'jsonb', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('cabildeo_close_policy')
    .addColumn('cabildeo', 'varchar', (col) => col.primaryKey())
    .addColumn('deadline', 'varchar')
    .addColumn('openedAt', 'varchar', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('cabildeo_close_policy').execute()
  await db.schema.dropTable('cabildeo_final_tally').execute()
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .dropColumn('effectiveTotalPowerMicros')
    .execute()
  await db.schema
    .alterTable('cabildeo_cabildeo')
    .dropColumn('optionEffectivePowerMicros')
    .execute()
  await db.schema
    .alterTable('cabildeo_delegation')
    .dropColumn('eligibilityProofRef')
    .execute()
}
