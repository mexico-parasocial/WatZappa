// @ts-nocheck
import { sql } from 'kysely'
import { DatabaseSchema } from '../../db/database-schema.js'
import { countAll } from '../../db/util.js'

export const recomputeParaProfileStats = async (
  db: DatabaseSchema,
  did: string,
) => {
  const [votesReceivedRes, votesCastRes, contributionRes, activeInRes] =
    await Promise.all([
      db
        .selectFrom('para_post')
        .leftJoin('para_post_meta', 'para_post_meta.postUri', 'para_post.uri')
        .leftJoin('post_agg', 'post_agg.uri', 'para_post.uri')
        .where('para_post.creator', '=', did)
        .select(
          sql<number>`coalesce(sum(coalesce("para_post_meta"."voteScore", "post_agg"."likeCount", 0)), 0)`.as(
            'votesReceivedAllTime',
          ),
        )
        .executeTakeFirst(),
      db
        .selectFrom('like')
        .innerJoin('para_post', 'para_post.uri', 'like.subject')
        .where('like.creator', '=', did)
        .select(countAll.as('votesCastAllTime'))
        .executeTakeFirst(),
      db
        .selectFrom('para_post')
        .where('creator', '=', did)
        .select(
          sql<number>`coalesce(sum(case when "para_post"."postType" = 'policy' then 1 else 0 end), 0)`.as(
            'policies',
          ),
        )
        .select(
          sql<number>`coalesce(sum(case when "para_post"."postType" = 'matter' then 1 else 0 end), 0)`.as(
            'matters',
          ),
        )
        .select(
          sql<number>`coalesce(sum(case when "para_post"."replyParent" is not null then 1 else 0 end), 0)`.as(
            'comments',
          ),
        )
        .executeTakeFirst(),
      db
        .selectFrom('para_post_meta')
        .where('creator', '=', did)
        .where('community', 'is not', null)
        .select('community')
        .select(countAll.as('count'))
        .groupBy('community')
        .orderBy('count', 'desc')
        .orderBy('community', 'asc')
        .limit(8)
        .execute(),
    ])

  const votesReceivedAllTime = votesReceivedRes?.votesReceivedAllTime ?? 0
  const votesCastAllTime = votesCastRes?.votesCastAllTime ?? 0
  const policies = contributionRes?.policies ?? 0
  const matters = contributionRes?.matters ?? 0
  const comments = contributionRes?.comments ?? 0
  const activeIn = activeInRes
    .map((row) => row.community)
    .filter((community): community is string => !!community)

  await db
    .insertInto('para_profile_stats')
    .values({
      did,
      influence: votesReceivedAllTime,
      votesReceivedAllTime,
      votesCastAllTime,
      policies,
      matters,
      comments,
      activeIn: activeIn.length
        ? sql<string[]>`${JSON.stringify(activeIn)}`
        : null,
      computedAt: new Date().toISOString(),
    })
    .onConflict((oc) =>
      oc.column('did').doUpdateSet({
        influence: votesReceivedAllTime,
        votesReceivedAllTime,
        votesCastAllTime,
        policies,
        matters,
        comments,
        activeIn: activeIn.length
          ? sql<string[]>`${JSON.stringify(activeIn)}`
          : null,
        computedAt: new Date().toISOString(),
      }),
    )
    .execute()
}
