// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.discourse.getTopology({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: {
          topology: {
            $type: 'com.para.discourse.getTopology#discourseTopology',
            ideologicalCentroid: {
              $type: 'com.para.discourse.getTopology#ideologicalCentroid',
              x: 0,
              y: 0,
            },
            ideologicalSpread: 0,
            crossCompassEngagement: 0,
            positionDensity: {
              $type: 'com.para.discourse.getTopology#positionDensity',
            },
            argumentBalance: {
              $type: 'com.para.discourse.getTopology#argumentBalance',
              claims: 0,
              evidence: 0,
              questions: 0,
              rebuttals: 0,
            },
            proposalVelocity: {
              $type: 'com.para.discourse.getTopology#proposalVelocity',
              proposed: 0,
              deliberating: 0,
              voting: 0,
              resolved: 0,
            },
          },
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
