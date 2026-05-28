import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { tableName as paraQvldDelegationTableName } from '../db/tables/para-qvl-delegation.js'
import { tableName as paraQvldEigenstateTableName } from '../db/tables/para-qvl-eigenstate-snapshot.js'
import { tableName as paraQvldIntensityTableName } from '../db/tables/para-qvl-intensity.js'
import { tableName as paraQvldVoteTableName } from '../db/tables/para-qvl-vote.js'
import { countAll } from '../db/util.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaAuditTrail(req) {
    const proposal = req.proposal

    // Raw votes
    const votes = await db.db
      .selectFrom(paraQvldVoteTableName)
      .where('proposal', '=', proposal)
      .select(['creator as voter', 'signal', 'createdAt'])
      .orderBy('createdAt', 'asc')
      .execute()

    // Raw intensities
    const intensities = await db.db
      .selectFrom(paraQvldIntensityTableName)
      .where('proposal', '=', proposal)
      .select([
        'voter',
        'signal',
        'units',
        'creditsSpent',
        'delegatedFrom',
        'delegationDepth',
        'effectiveWeight',
        'createdAt',
      ])
      .orderBy('createdAt', 'asc')
      .execute()

    // Raw delegations scoped to this proposal or its community
    const voteRow = votes[0]
    const community = voteRow
      ? await db.db
          .selectFrom(paraQvldVoteTableName)
          .where('proposal', '=', proposal)
          .select('community')
          .executeTakeFirst()
      : null

    const delegations = await db.db
      .selectFrom(paraQvldDelegationTableName)
      .where((qb) =>
        qb
          .where('scopeProposal', '=', proposal)
          .orWhere('scopeCommunity', '=', community?.community ?? ''),
      )
      .where('revokedAt', 'is', null)
      .select([
        'delegate',
        'delegator',
        'delegateRole',
        'scopeMode',
        'scopeCommunity',
        'scopeProposal',
        'createdAt',
      ])
      .execute()

    // Flat tally steps
    const flatSignalSum = votes.reduce((sum, v) => sum + v.signal, 0)
    const flatVoteCount = votes.length
    const flatAvg = flatVoteCount > 0 ? flatSignalSum / flatVoteCount : 0
    const quorumTarget = Math.max(10, Math.ceil(flatVoteCount * 0.2))

    // √n tally steps
    const blockCredits = new Map<string, number>()
    for (const i of intensities) {
      blockCredits.set(
        i.voter,
        (blockCredits.get(i.voter) || 0) + i.creditsSpent,
      )
    }
    let sqrtNWeightSum = 0
    for (const credits of blockCredits.values()) {
      sqrtNWeightSum += Math.sqrt(credits)
    }
    let sqrtNSignalSum = 0
    let sqrtNCount = 0
    for (const i of intensities) {
      const weight = Math.sqrt(i.creditsSpent)
      sqrtNSignalSum += i.signal * weight
      sqrtNCount += weight
    }
    const sqrtNAvg = sqrtNCount > 0 ? sqrtNSignalSum / sqrtNCount : 0

    // Correlation tally steps
    const latestEigenstate = await db.db
      .selectFrom(paraQvldEigenstateTableName)
      .where('community', '=', community?.community ?? '')
      .orderBy('computedAt', 'desc')
      .limit(1)
      .selectAll()
      .executeTakeFirst()

    let correlationFactor = 1
    if (latestEigenstate) {
      const eigenvalues = Array.isArray(latestEigenstate.eigenvalues)
        ? (latestEigenstate.eigenvalues as any[])
        : []
      const principal = eigenvalues[0]?.value ?? 0
      correlationFactor = principal > 0 ? 10000 / (10000 + principal * 0.25) : 1
    }

    // Metrics — post-√n concentration
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

    const audit = {
      proposal,
      votes: votes.map((v) => ({
        voter: v.voter,
        signal: v.signal,
        createdAt: v.createdAt,
      })),
      intensities: intensities.map((i) => ({
        voter: i.voter,
        signal: i.signal,
        units: i.units,
        creditsSpent: i.creditsSpent,
        delegatedFrom: i.delegatedFrom ?? undefined,
        delegationDepth: i.delegationDepth,
        effectiveWeight: i.effectiveWeight ?? undefined,
        createdAt: i.createdAt,
      })),
      delegations: delegations.map((d) => ({
        delegate: d.delegate,
        delegator: d.delegator,
        delegateRole: d.delegateRole ?? undefined,
        scopeMode: d.scopeMode,
        scopeCommunity: d.scopeCommunity ?? undefined,
        scopeProposal: d.scopeProposal ?? undefined,
        createdAt: d.createdAt,
      })),
      tallies: {
        flat: {
          steps: [
            { description: 'Sum all signals', value: flatSignalSum.toFixed(4) },
            { description: 'Count all votes', value: flatVoteCount.toString() },
            {
              description: 'Compute average (sum / count)',
              value: flatAvg.toFixed(4),
            },
            {
              description: 'Quorum target (max(10, 20% of votes))',
              value: quorumTarget.toString(),
            },
            {
              description: 'Quorum met?',
              value: flatVoteCount >= quorumTarget ? 'yes' : 'no',
            },
          ],
          result: {
            voteCount: flatVoteCount,
            signalSum: flatSignalSum.toFixed(4),
            signalAverage: flatAvg.toFixed(4),
            quorumMet: flatVoteCount >= quorumTarget,
            quorumTarget,
            effectiveWeightSum: flatVoteCount.toFixed(4),
          },
        },
        sqrtN: {
          steps: [
            {
              description: 'Group intensities by voter',
              value: `${blockCredits.size} blocks`,
            },
            {
              description: 'Sum credits per block',
              value: Array.from(blockCredits.entries())
                .map(([k, v]) => `${k}: ${v}`)
                .join(', '),
            },
            {
              description: 'Apply √n to each block',
              value: Array.from(blockCredits.entries())
                .map(([k, v]) => `${k}: √${v} = ${Math.sqrt(v).toFixed(4)}`)
                .join(', '),
            },
            {
              description: 'Total effective weight (√n sum)',
              value: sqrtNWeightSum.toFixed(4),
            },
            {
              description: 'Weighted signal average',
              value: sqrtNAvg.toFixed(4),
            },
          ],
          result: {
            voteCount: intensities.length,
            signalSum: sqrtNSignalSum.toFixed(4),
            signalAverage: sqrtNAvg.toFixed(4),
            quorumMet: flatVoteCount >= quorumTarget,
            quorumTarget,
            effectiveWeightSum: sqrtNWeightSum.toFixed(4),
          },
        },
        correlation: {
          steps: [
            {
              description: 'Load latest eigenstate snapshot',
              value: latestEigenstate
                ? `snapshot ${latestEigenstate.uri}`
                : 'none available',
            },
            {
              description: 'Principal eigenvalue (×10000)',
              value: (() => {
                const evs = Array.isArray(latestEigenstate?.eigenvalues)
                  ? (latestEigenstate?.eigenvalues as any[])
                  : []
                return (evs[0]?.value ?? 0).toString()
              })(),
            },
            {
              description: 'Correlation factor = 1 / (1 + α × eigenvalue)',
              value: correlationFactor.toFixed(4),
            },
            {
              description: 'Apply factor to flat tally',
              value: (flatAvg * correlationFactor).toFixed(4),
            },
          ],
          result: {
            voteCount: flatVoteCount,
            signalSum: (flatSignalSum * correlationFactor).toFixed(4),
            signalAverage: (flatAvg * correlationFactor).toFixed(4),
            quorumMet: flatVoteCount >= quorumTarget,
            quorumTarget,
            effectiveWeightSum: (flatVoteCount * correlationFactor).toFixed(4),
          },
        },
      },
      metrics: {
        maxWeightRatio: maxWeightRatio.toFixed(4),
        effectiveParticipants: effectiveParticipants.toFixed(2),
        revocationRate: revocationRate.toFixed(2),
        directVotePct: directVotePct.toFixed(2),
        shadowMode: true,
      },
    }

    return {
      auditJson: JSON.stringify(audit),
    }
  },
})
