// @ts-nocheck
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.discourse.getTopics, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const result = await getDiscourseTopics({
        ctx,
        params,
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

const getDiscourseTopics = async (inputs: {
  ctx: AppContext
  params: com.para.discourse.getTopics.$Params
}) => {
  const { ctx, params } = inputs
  const res = await ctx.dataplane.getParaDiscourseTopics({
    community: params.community ?? '',
    // @NOTE `timeframe` is not a declared param, so it was always unset here.
    timeframe: undefined,
  })

  return {
    topics: res.topics.map((t) => ({
      clusterLabel: t.clusterLabel,
      keywords: t.keywords,
      postCount: t.postCount,
      authorCount: t.authorCount,
      avgSentiment: Math.round(t.avgSentiment * 100),
    })),
  }
}
