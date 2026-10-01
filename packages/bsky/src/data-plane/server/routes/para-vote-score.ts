import { sql } from 'kysely'
import { Database } from '../db/index.js'

/**
 * Net public reactions per subject: each voter counts once, with their signed
 * reaction (com.para.civic.openQuestionVote, -1/0/+1) overriding a legacy
 * like. Mirrors the "effective" reactions in getParaInfluence. Subjects with
 * no reactions are absent from the result.
 */
export async function getParaVoteScores(
  db: Database,
  subjects: string[],
): Promise<Map<string, number>> {
  const scores = new Map<string, number>()
  if (subjects.length === 0) return scores

  const list = sql.join(subjects)
  const result = await sql<{ subject: string; score: number }>`
    with reactions as (
      select subject, creator, 1 as value, 0 as priority, "indexedAt", uri
      from "like" where subject in (${list})
      union all
      select subject, creator, value, 1 as priority, "indexedAt", uri
      from para_open_question_vote where subject in (${list})
    ), effective as (
      select distinct on (subject, creator) subject, creator, value
      from reactions
      order by subject, creator, priority desc, "indexedAt" desc, uri desc
    )
    select subject, coalesce(sum(value), 0)::integer as score
    from effective group by subject
  `.execute(db.db)
  for (const row of result.rows) scores.set(row.subject, row.score)
  return scores
}
