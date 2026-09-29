import type { DatabaseSchema } from '../../db/database-schema.js'
import { recomputeCabildeoAggregates } from './recompute-cabildeo-aggregates.js'

/** Recovers voting deadlines after a restart and persists immutable snapshots. */
export async function finalizeDueCabildeos(db: DatabaseSchema): Promise<void> {
  const due = await db
    .selectFrom('cabildeo_close_policy')
    .leftJoin(
      'cabildeo_final_tally',
      'cabildeo_final_tally.cabildeo',
      'cabildeo_close_policy.cabildeo',
    )
    .where('cabildeo_final_tally.cabildeo', 'is', null)
    .where('cabildeo_close_policy.deadline', '<=', new Date().toISOString())
    .select('cabildeo_close_policy.cabildeo')
    .execute()
  for (const row of due) await recomputeCabildeoAggregates(db, row.cabildeo)
}
