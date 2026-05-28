// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/community/listParentCommunities.js'
import { resHeaders } from '../../../util.js'
import { listCommunityRelations } from './listCommunityRelations.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listParentCommunities({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await listCommunityRelations({
        ctx,
        params: {
          ...params,
          childCommunityUri: params.communityUri,
          relation: 'parentChild',
        } as QueryParams,
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
