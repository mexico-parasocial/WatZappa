import { type Kysely, sql } from 'kysely'

/**
 * A community used to pick a governance model; every community is
 * hierarchical now, so the column goes.
 *
 * @NOTE this once also rebuilt the authority a retired `horizontal` community
 * had derived. OD-9 phase 5 drops the board and authority-event tables
 * (`20261109T120000000Z-drop-legacy-community-tables`), and no community
 * outlives that, so only the column is dropped here.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table "para_community_board" drop column if exists "governanceMode"`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table "para_community_board"
    add column if not exists "governanceMode" varchar default 'hierarchical'
  `.execute(db)
}
