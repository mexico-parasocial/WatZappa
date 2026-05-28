// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.civic.getPolicyTally({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const res = await ctx.dataplane.getParaPolicyTally({
        postUri: params.post,
      })

      if (!res.tally) {
        throw new InvalidRequestError('Policy tally not found', 'NotFound')
      }

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          tally: {
            subject: res.tally.subject,
            subjectType: parseString(res.tally.subjectType) || 'policy',
            community: parseString(res.tally.community) || '',
            voteCount: res.tally.voteCount,
            directVoteCount: res.tally.directVoteCount,
            delegatedVoteCount: res.tally.delegatedVoteCount,
            signalSum: res.tally.signalSum,
            signalAverage: formatSignalAverage(res.tally.signalAverage),
            eligibleVoterCount: res.tally.eligibleVoterCount,
            quorumTarget: res.tally.quorumTarget,
            quorumMet: res.tally.quorumMet,
            official: res.tally.official,
            certified: res.tally.certified,
            outcome: parseString(res.tally.outcome) || 'insufficient_quorum',
            state: parseString(res.tally.state) || 'draft',
            breakdown: res.tally.breakdown.map((bucket) => ({
              signal: bucket.signal,
              count: bucket.count,
            })),
            computedAt: parseString(res.tally.computedAt),
          },
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const formatSignalAverage = (value: number | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0'
  }

  const fixed = value.toFixed(4)
  return fixed.replace(/\.?0+$/, '')
}
