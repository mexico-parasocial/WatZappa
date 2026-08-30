// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.alpha.getAccess({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: {
          hasAccess: true,
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
