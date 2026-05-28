import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaUserAlignment(req) {
    const row = await db.db
      .selectFrom('raq_assessment')
      .where('creator', '=', req.did)
      .where('isPublic', '=', true)
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
    const communityId = req.community?.trim()
    if (!communityId) {
      return {
        axesJson: '[]',
        compassJson: '{}',
        participantCount: 0,
        cursor: '',
      }
    }

    const normalizedCommunity = communityId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const board = await db.db
      .selectFrom('para_community_board as board')
      .where(
        sql<boolean>`(
          "board"."uri" = ${communityId}
          or "board"."slug" = ${communityId}
          or "board"."slug" = ${normalizedCommunity}
          or regexp_replace(lower(coalesce("board"."name", '')), '[^a-z0-9]+', '-', 'g') = ${normalizedCommunity}
        )`,
      )
      .select(['board.uri', 'board.slug'])
      .executeTakeFirst()

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

    // Use a window function to get the latest assessment per member
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

    const latestAssessments = assessments.filter((a) => a.rn === 1)

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
    const limit = Math.min(req.limit || 50, 100)
    const viewerDid = req.viewerDid || ''

    let query = db.db
      .selectFrom('raq_proposal as p')
      .selectAll('p')
      .orderBy('p.sortAt', 'desc')
      .limit(limit)

    if (req.community) {
      const normalizedCommunity = req.community.trim().toLowerCase()
      query = query.where(
        sql<boolean>`coalesce(lower("p"."targetCommunity"), '') = ${normalizedCommunity}`,
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

    const voteMap = new Map(
      voteRows.map((v) => [
        v.subject,
        { upvotes: v.upvotes || 0, downvotes: v.downvotes || 0 },
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
          answerCount: a.answerCount || 0,
          answerAverage: a.answerAverage || 0,
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

    const cursor =
      proposals.length === limit ? proposals[proposals.length - 1].sortAt : ''

    return { proposals: views, cursor }
  },
})

function determineNinth(x: number, y: number): string {
  const h = x < -333 ? 'left' : x > 333 ? 'right' : 'center'
  const v = y < -333 ? 'auth' : y > 333 ? 'lib' : 'center'
  if (h === 'center' && v === 'center') return 'center'
  return `${v}-${h}`
}
