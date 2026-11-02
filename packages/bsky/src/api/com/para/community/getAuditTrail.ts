import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'
import { assertQuadraticVotingEnabled } from './quadratic-voting-gate.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.getAuditTrail, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      assertQuadraticVotingEnabled(ctx, { viewer, req })
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaAuditTrail({
        proposal: params.proposal ?? '',
      })

      const audit = parseJson(res.auditJson)

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          proposal: audit.proposal,
          votes: audit.votes,
          intensities: audit.intensities,
          delegations: audit.delegations,
          tallies: audit.tallies,
          metrics: audit.metrics,
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
