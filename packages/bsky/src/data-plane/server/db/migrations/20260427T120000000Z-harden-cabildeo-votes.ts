import { Kysely, sql } from 'kysely'
import { recomputeCabildeoAggregates } from '../../indexing/plugins/recompute-cabildeo-aggregates.js'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    delete from cabildeo_vote
    where uri in (
      select uri
      from (
        select
          uri,
          row_number() over (
            partition by creator, cabildeo
            order by "sortAt" desc, cid desc
          ) as row_num
        from cabildeo_vote
      ) ranked
      where row_num > 1
    )
  `.execute(db)

  await db.schema
    .createIndex('cabildeo_vote_unique_creator_cabildeo')
    .on('cabildeo_vote')
    .columns(['creator', 'cabildeo'])
    .unique()
    .execute()

  const cabildeos = await (db as Kysely<any>)
    .selectFrom('cabildeo_cabildeo')
    .select(['uri'])
    .execute()
  for (const cabildeo of cabildeos as Array<{ uri: string }>) {
    await recomputeCabildeoAggregates(db as never, cabildeo.uri)
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('cabildeo_vote_unique_creator_cabildeo').execute()
}
