import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'
import { listCommunityRelations } from './listCommunityRelations.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.listChildCommunities, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await listCommunityRelations({
        ctx,
        params: {
          ...params,
          parentCommunityUri: params.communityUri,
          relation: 'parentChild',
        } as com.para.community.listChildCommunities.$Params,
      })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
