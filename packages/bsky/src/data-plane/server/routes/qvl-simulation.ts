import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { tableName as paraQvldDelegationTableName } from '../db/tables/para-qvl-delegation.js'
import { tableName as paraQvldEigenstateTableName } from '../db/tables/para-qvl-eigenstate-snapshot.js'
import { tableName as paraQvldIntensityTableName } from '../db/tables/para-qvl-intensity.js'
import { tableName as paraQvldVoteTableName } from '../db/tables/para-qvl-vote.js'
import { countAll } from '../db/util.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaTallySimulation(req) {
    const proposal = req.proposal

    // 1. Flat tally: direct signals from para_qvld_vote
    const flatVotes = await db.db
      .selectFrom(paraQvldVoteTableName)
      .where('proposal', '=', proposal)
      .selectAll()
      .execute()

    const flatSignalSum = flatVotes.reduce((sum, v) => sum + v.signal, 0)
    const flatVoteCount = flatVotes.length
    const flatSignalAverage =
      flatVoteCount > 0 ? flatSignalSum / flatVoteCount : 0

    const flatBreakdown = await db.db
      .selectFrom(paraQvldVoteTableName)
      .where('proposal', '=', proposal)
      .select(['signal', countAll.as('count')])
      .groupBy('signal')
      .orderBy('signal', 'asc')
      .execute()

    // 2. √n tally: from para_qvld_intensity
    const intensities = await db.db
      .selectFrom(paraQvldIntensityTableName)
      .where('proposal', '=', proposal)
      .selectAll()
      .execute()

    // Group by voter (treating each voter as a block for MVP)
    const blockCredits = new Map<string, number>()
    for (const i of intensities) {
      const blockKey = i.voter
      blockCredits.set(
        blockKey,
        (blockCredits.get(blockKey) || 0) + i.creditsSpent,
      )
    }

    let sqrtNWeightSum = 0
    for (const credits of blockCredits.values()) {
      sqrtNWeightSum += Math.sqrt(credits)
    }

    // For √n signal average, we weight each intensity signal by √credits
    let sqrtNSignalSum = 0
    let sqrtNCount = 0
    for (const i of intensities) {
      const weight = Math.sqrt(i.creditsSpent)
      sqrtNSignalSum += i.signal * weight
      sqrtNCount += weight
    }
    const sqrtNSignalAverage = sqrtNCount > 0 ? sqrtNSignalSum / sqrtNCount : 0

    const sqrtNBreakdown = await db.db
      .selectFrom(paraQvldIntensityTableName)
      .where('proposal', '=', proposal)
      .select(['signal', countAll.as('count')])
      .groupBy('signal')
      .orderBy('signal', 'asc')
      .execute()

    // 3. Correlation-adjusted: use latest eigenstate snapshot if available
    const latestEigenstate = await db.db
      .selectFrom(paraQvldEigenstateTableName)
      .where('community', 'in', (qb) =>
        qb
          .selectFrom(paraQvldVoteTableName)
          .where('proposal', '=', proposal)
          .select('community')
          .limit(1),
      )
      .orderBy('computedAt', 'desc')
      .limit(1)
      .selectAll()
      .executeTakeFirst()

    let correlationSignalAverage = flatSignalAverage
    let correlationWeightSum = flatVoteCount
    if (latestEigenstate) {
      // Simple correlation discount: apply a flat discount based on concentration
      const eigenvalues = Array.isArray(latestEigenstate.eigenvalues)
        ? (latestEigenstate.eigenvalues as any[])
        : []
      const principalEigenvalue = eigenvalues[0]?.value ?? 0
      // Fixed-point: value is scaled by 10000
      const correlationFactor =
        principalEigenvalue > 0
          ? 10000 / (10000 + principalEigenvalue * 0.25)
          : 1
      correlationWeightSum = flatVoteCount * correlationFactor
      correlationSignalAverage = flatSignalAverage * correlationFactor
    }

    const correlationBreakdown = flatBreakdown

    // 4. Metrics — post-√n concentration, not Gini on raw credits
    const effectiveWeights = Array.from(blockCredits.values()).map((c) =>
      Math.sqrt(c),
    )
    const totalEffectiveWeight = effectiveWeights.reduce((a, b) => a + b, 0)

    const maxWeightRatio =
      totalEffectiveWeight > 0
        ? Math.max(...effectiveWeights) / totalEffectiveWeight
        : 0

    const hhi =
      totalEffectiveWeight > 0
        ? effectiveWeights.reduce(
            (sum, w) => sum + (w / totalEffectiveWeight) ** 2,
            0,
          )
        : 0
    const effectiveParticipants = hhi > 0 ? 1 / hhi : 0

    const totalDelegations = await db.db
      .selectFrom(paraQvldDelegationTableName)
      .where('scopeProposal', '=', proposal)
      .select([countAll.as('count')])
      .executeTakeFirst()

    const revokedDelegations = await db.db
      .selectFrom(paraQvldDelegationTableName)
      .where('scopeProposal', '=', proposal)
      .where('revokedAt', 'is not', null)
      .select([countAll.as('count')])
      .executeTakeFirst()

    const revocationRate =
      Number(totalDelegations?.count ?? 0) > 0
        ? (Number(revokedDelegations?.count ?? 0) /
            Number(totalDelegations?.count ?? 0)) *
          100
        : 0

    const directVoteCount = intensities.filter(
      (i) => i.delegationDepth === 0,
    ).length
    const directVotePct =
      intensities.length > 0 ? (directVoteCount / intensities.length) * 100 : 0

    const quorumTarget = Math.max(10, Math.ceil(flatVoteCount * 0.2))
    const quorumMet = flatVoteCount >= quorumTarget

    return {
      flatJson: JSON.stringify({
        voteCount: flatVoteCount,
        signalSum: flatSignalSum.toFixed(4),
        signalAverage: flatSignalAverage.toFixed(4),
        quorumMet,
        quorumTarget,
        effectiveWeightSum: flatVoteCount.toFixed(4),
        breakdown: flatBreakdown.map((b) => ({
          signal: b.signal,
          count: Number(b.count),
        })),
      }),
      sqrtNJson: JSON.stringify({
        voteCount: intensities.length,
        signalSum: sqrtNSignalSum.toFixed(4),
        signalAverage: sqrtNSignalAverage.toFixed(4),
        quorumMet,
        quorumTarget,
        effectiveWeightSum: sqrtNWeightSum.toFixed(4),
        breakdown: sqrtNBreakdown.map((b) => ({
          signal: b.signal,
          count: Number(b.count),
        })),
      }),
      correlationJson: JSON.stringify({
        voteCount: flatVoteCount,
        signalSum: (
          flatSignalSum * (correlationWeightSum / flatVoteCount || 1)
        ).toFixed(4),
        signalAverage: correlationSignalAverage.toFixed(4),
        quorumMet,
        quorumTarget,
        effectiveWeightSum: correlationWeightSum.toFixed(4),
        breakdown: correlationBreakdown.map((b) => ({
          signal: b.signal,
          count: Number(b.count),
        })),
      }),
      metricsJson: JSON.stringify({
        maxWeightRatio: maxWeightRatio.toFixed(4),
        effectiveParticipants: effectiveParticipants.toFixed(2),
        revocationRate: revocationRate.toFixed(2),
        directVotePct: directVotePct.toFixed(2),
        shadowMode: true,
      }),
    }
  },
})
