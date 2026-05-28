// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.getTallySimulation({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaTallySimulation({
        proposal: params.proposal ?? '',
      })

      const flat = parseJson(res.flatJson)
      const sqrtN = parseJson(res.sqrtNJson)
      const correlation = parseJson(res.correlationJson)
      const metrics = parseJson(res.metricsJson)

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          flat,
          sqrtN,
          correlation,
          metrics: {
            maxWeightRatio: metrics.maxWeightRatio,
            effectiveParticipants: metrics.effectiveParticipants,
            revocationRate: metrics.revocationRate,
            directVotePct: metrics.directVotePct,
            shadowMode: metrics.shadowMode,
          },
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

function parseJson(json: string): any {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}
