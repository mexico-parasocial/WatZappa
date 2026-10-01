import { sql } from 'kysely'
import type { DatabaseSchema } from '../../db/database-schema.js'

/** Count current public reactions across the actor's entire content history. */
export async function getParaInfluence(db: DatabaseSchema, did: string) {
  // @NOTE signed reactions override a legacy like by the same voter on the
  // same subject, including a neutral reaction. Metadata never awards points.
  const prefix = `at://${did}/%`
  const result = await sql<{
    influence: number
    votesCastAllTime: number
  }>`
    with content as (
      select uri, creator from post
      union select uri, creator from para_post
      union select uri, creator from raq_proposal
      union select uri, creator from para_deliberation_statement
    ), reactions as (
      select uri, creator, subject, 1 as value, 0 as priority, "indexedAt"
      from "like" where subject like ${prefix} or creator = ${did}
      union all
      select uri, creator, subject, value, 1 as priority, "indexedAt"
      from para_open_question_vote where subject like ${prefix} or creator = ${did}
      union all
      select uri, creator, subject, value, 1 as priority, "indexedAt"
      from raq_proposal_vote where subject like ${prefix} or creator = ${did}
      union all
      select uri, creator, statement as subject,
        case direction when 'agree' then 1 when 'disagree' then -1 else 0 end as value,
        1 as priority, "indexedAt"
      from para_deliberation_vote where statement like ${prefix} or creator = ${did}
    ), effective as (
      select distinct on (creator, subject) creator, subject, value
      from reactions order by creator, subject, priority desc, "indexedAt" desc, uri desc
    )
    select
      coalesce(sum(case when content.creator = ${did} then effective.value else 0 end), 0)::integer as influence,
      count(*) filter (where effective.creator = ${did} and effective.value <> 0)::integer as "votesCastAllTime"
    from effective join content on content.uri = effective.subject
  `.execute(db)
  return result.rows[0] ?? { influence: 0, votesCastAllTime: 0 }
}
