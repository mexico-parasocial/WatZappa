import { type Kysely, sql } from 'kysely'

/*
 * Collections written before the bsync subscription learned to index them live
 * only in `private_data`. Copy them into `collection` so they become readable.
 * Rows already present are left alone.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    insert into collection (creator, key, "createdAt", "updatedAt", payload)
    select "actorDid", key, "indexedAt", "updatedAt", payload
    from private_data
    where namespace = 'com.para.collection.defs#collection'
    on conflict (creator, key) do nothing
  `.execute(db)
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Data backfill only; nothing to undo.
}
