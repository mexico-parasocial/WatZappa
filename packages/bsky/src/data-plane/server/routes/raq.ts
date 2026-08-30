import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'

// Normalize a community name/identifier the way board slugs are formed:
// lowercase, runs of non-alphanumerics collapsed to hyphens, edges trimmed.
function normalizeCommunityId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve a community board from any identifier a client might send: its uri,
 * slug, slug-normalized form, or slug-normalized name. Shared by the
 * community-alignment and proposals endpoints so both accept the same inputs.
 */
async function findCommunityBoard(
  db: Database,
  communityId: string,
): Promise<
  { uri: string; slug: string | null; name: string | null } | undefined
> {
  const normalized = normalizeCommunityId(communityId)
  return db.db
    .selectFrom('para_community_board as board')
    .where(
      sql<boolean>`(
        "board"."uri" = ${communityId}
        or "board"."slug" = ${communityId}
        or "board"."slug" = ${normalized}
        or regexp_replace(lower(coalesce("board"."name", '')), '[^a-z0-9]+', '-', 'g') = ${normalized}
      )`,
    )
    .select(['board.uri', 'board.slug', 'board.name'])
    .executeTakeFirst()
}

// The SQL mirror of normalizeCommunityId, for matching free-text values
// (e.g. a proposal's targetCommunity) against normalized identifiers.
const normalizedCommunitySql = sql`trim(both '-' from regexp_replace(lower(coalesce("p"."targetCommunity", '')), '[^a-z0-9]+', '-', 'g'))`

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaUserAlignment(req) {
    // The viewer may always read their own assessment; everyone else only
    // sees public ones.
    const isSelf = !!req.viewerDid && req.viewerDid === req.did

    let query = db.db
      .selectFrom('raq_assessment')
      .where('creator', '=', req.did)
    if (!isSelf) {
      query = query.where('isPublic', '=', true)
    }
    const row = await query
      .orderBy('completedAt', 'desc')
      .selectAll()
      .executeTakeFirst()

    if (!row) {
      return { assessmentJson: '' }
    }

    const assessment = {
      results: row.resultsJson,
      compass: row.compassJson,
      ideology: row.ideologyJson,
      secondaryIdeology: row.secondaryIdeologyJson,
      partyMatches: row.partyMatchesJson,
      completedAt: row.completedAt,
    }

    return { assessmentJson: JSON.stringify(assessment) }
  },

  async getParaCommunityAlignment(req) {
    const limit = Math.min(Math.max(req.limit || 20, 1), 100)

    const communityId = req.community?.trim()
    if (!communityId) {
      return {
        axesJson: '[]',
        compassJson: '{}',
        participantCount: 0,
        cursor: '',
      }
    }

    const board = await findCommunityBoard(db, communityId)

    if (!board) {
      return {
        axesJson: '[]',
        compassJson: '{}',
        participantCount: 0,
        cursor: '',
      }
    }

    const members = await db.db
      .selectFrom('para_community_membership')
      .where('communityUri', '=', board.uri)
      .where('membershipState', '=', 'active')
      .select('creator')
      .execute()

    const dids = members.map((m) => m.creator)
    if (dids.length === 0) {
      return {
        axesJson: '[]',
        compassJson: '{}',
        participantCount: 0,
        cursor: '',
      }
    }

    // Use a window function to get the latest assessment per member, newest
    // first, bounded by the requested limit.
    const assessments = await db.db
      .selectFrom('raq_assessment')
      .where('creator', 'in', dids)
      .where('isPublic', '=', true)
      .selectAll()
      .select(
        sql<number>`row_number() over (partition by "creator" order by "completedAt" desc)`.as(
          'rn',
        ),
      )
      .execute()

    const latestAssessments = assessments
      .filter((a) => a.rn === 1)
      .sort((a, b) =>
        String(b.completedAt ?? '').localeCompare(String(a.completedAt ?? '')),
      )
      .slice(0, limit)

    if (latestAssessments.length === 0) {
      return {
        axesJson: '[]',
        compassJson: '{}',
        participantCount: 0,
        cursor: '',
      }
    }

    const axisSums = new Map<
      string,
      {
        score: number
        label: string
        axisTitle: string
        labelLow: string
        labelHigh: string
        count: number
      }
    >()
    let totalX = 0
    let totalY = 0
    let compassCount = 0

    for (const assessment of latestAssessments) {
      const results = assessment.resultsJson as Array<{
        axisId: string
        axisTitle: string
        score: number
        label: string
        labelLow?: string
        labelHigh?: string
      }> | null

      if (results && Array.isArray(results)) {
        for (const r of results) {
          const existing = axisSums.get(r.axisId)
          if (existing) {
            existing.score += r.score
            existing.count += 1
          } else {
            axisSums.set(r.axisId, {
              score: r.score,
              label: r.label,
              axisTitle: r.axisTitle,
              labelLow: r.labelLow || '',
              labelHigh: r.labelHigh || '',
              count: 1,
            })
          }
        }
      }

      const compass = assessment.compassJson as {
        x?: number
        y?: number
      } | null
      if (
        compass &&
        typeof compass.x === 'number' &&
        typeof compass.y === 'number'
      ) {
        totalX += compass.x
        totalY += compass.y
        compassCount += 1
      }
    }

    const axes = Array.from(axisSums.entries()).map(([axisId, data]) => ({
      axisId,
      axisTitle: data.axisTitle,
      score: Math.round(data.score / data.count),
      label: data.label,
      labelLow: data.labelLow,
      labelHigh: data.labelHigh,
    }))

    const compass =
      compassCount > 0
        ? {
            x: Math.round(totalX / compassCount),
            y: Math.round(totalY / compassCount),
            ninth: determineNinth(
              Math.round(totalX / compassCount),
              Math.round(totalY / compassCount),
            ),
          }
        : { x: 0, y: 0, ninth: 'center' }

    return {
      axesJson: JSON.stringify(axes),
      compassJson: JSON.stringify(compass),
      participantCount: latestAssessments.length,
      cursor: '',
    }
  },

  async getParaProposals(req) {
    const limit = Math.min(Math.max(req.limit || 50, 1), 100)
    const viewerDid = req.viewerDid || ''
    const cursor = req.cursor || ''

    let query = db.db
      .selectFrom('raq_proposal as p')
      .selectAll('p')
      .orderBy('p.sortAt', 'desc')
      .limit(limit)

    if (cursor) {
      query = query.where('p.sortAt', '<', cursor)
    }

    if (req.community) {
      const communityId = req.community.trim()
      // Match proposals against every form the community's name takes — the
      // raw input, its normalized form, and the board's uri/slug/name — so a
      // proposal stored as "Jalisco, MX" is found by "jalisco" the same way
      // findCommunityBoard resolves boards.
      const candidates = new Set<string>([
        communityId.toLowerCase(),
        normalizeCommunityId(communityId),
      ])
      const board = await findCommunityBoard(db, communityId)
      if (board) {
        candidates.add(board.uri.toLowerCase())
        if (board.slug) candidates.add(board.slug.toLowerCase())
        if (board.name) candidates.add(board.name.toLowerCase())
      }
      query = query.where(
        sql<boolean>`${normalizedCommunitySql} = any(${[...candidates].map(normalizeCommunityId)})`,
      )
    }

    const proposals = await query.execute()
    if (proposals.length === 0) {
      return { proposals: [], cursor: '' }
    }

    const proposalUris = proposals.map((p) => p.uri)

    // Aggregate votes per proposal
    const voteRows = await db.db
      .selectFrom('raq_proposal_vote')
      .where('subject', 'in', proposalUris)
      .groupBy('subject')
      .select([
        'subject',
        sql<number>`sum(case when value > 0 then 1 else 0 end)`.as('upvotes'),
        sql<number>`sum(case when value < 0 then 1 else 0 end)`.as('downvotes'),
      ])
      .execute()

    // Postgres sum()/count()/avg() return strings; coerce before these reach
    // the protobuf int32 fields, which reject non-numbers.
    const voteMap = new Map(
      voteRows.map((v) => [
        v.subject,
        {
          upvotes: Number(v.upvotes) || 0,
          downvotes: Number(v.downvotes) || 0,
        },
      ]),
    )

    // Aggregate answers per proposal
    const answerRows = await db.db
      .selectFrom('raq_proposal_answer')
      .where('subject', 'in', proposalUris)
      .groupBy('subject')
      .select([
        'subject',
        sql<number>`count(*)`.as('answerCount'),
        sql<number>`round(avg(value))`.as('answerAverage'),
      ])
      .execute()

    const answerMap = new Map(
      answerRows.map((a) => [
        a.subject,
        {
          answerCount: Number(a.answerCount) || 0,
          answerAverage: Number(a.answerAverage) || 0,
        },
      ]),
    )

    // Viewer state
    let viewerVotes: { subject: string; value: number }[] = []
    let viewerAnswers: { subject: string; value: number }[] = []

    if (viewerDid) {
      viewerVotes = await db.db
        .selectFrom('raq_proposal_vote')
        .where('subject', 'in', proposalUris)
        .where('creator', '=', viewerDid)
        .select(['subject', 'value'])
        .execute()

      viewerAnswers = await db.db
        .selectFrom('raq_proposal_answer')
        .where('subject', 'in', proposalUris)
        .where('creator', '=', viewerDid)
        .select(['subject', 'value'])
        .execute()
    }

    const viewerVoteMap = new Map(viewerVotes.map((v) => [v.subject, v.value]))
    const viewerAnswerMap = new Map(
      viewerAnswers.map((a) => [a.subject, a.value]),
    )

    const views = proposals.map((p) => {
      const votes = voteMap.get(p.uri) || { upvotes: 0, downvotes: 0 }
      const answers = answerMap.get(p.uri) || {
        answerCount: 0,
        answerAverage: 0,
      }
      const viewerVote = viewerVoteMap.get(p.uri) || 0
      const viewerAnswer = viewerAnswerMap.get(p.uri)

      return {
        uri: p.uri,
        cid: p.cid,
        creator: p.creator,
        text: p.text,
        targetAxis: p.targetAxis || '',
        targetCommunity: p.targetCommunity || '',
        upvotes: votes.upvotes,
        downvotes: votes.downvotes,
        answerCount: answers.answerCount,
        answerAverage: answers.answerAverage,
        viewerUpvote: viewerVote > 0,
        viewerDownvote: viewerVote < 0,
        viewerAnswer: viewerAnswer ?? 0,
        createdAt: p.createdAt,
        indexedAt: p.indexedAt,
      }
    })

    const nextCursor =
      proposals.length === limit ? proposals[proposals.length - 1].sortAt : ''

    return { proposals: views, cursor: nextCursor }
  },
})

function determineNinth(x: number, y: number): string {
  const h = x < -333 ? 'left' : x > 333 ? 'right' : 'center'
  const v = y < -333 ? 'auth' : y > 333 ? 'lib' : 'center'
  if (h === 'center' && v === 'center') return 'center'
  return `${v}-${h}`
}
