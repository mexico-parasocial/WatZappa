// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/discourse/getSnapshot.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.discourse.getSnapshot({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const result = await getDiscourseSnapshot({
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

const getDiscourseSnapshot = async (inputs: {
  ctx: AppContext
  params: QueryParams
}) => {
  const { ctx, params } = inputs
  const res = await ctx.dataplane.getParaDiscourseSnapshot({
    community: params.community ?? '',
    timeframe: params.timeframe,
  })

  return {
    snapshots: res.snapshots.map((s) => ({
      community: s.community,
      bucket: s.bucket,
      postCount: s.postCount,
      uniqueAuthors: s.uniqueAuthors,
      avgConstructiveness: Math.round(s.avgConstructiveness * 100),
      semanticVolatility: Math.round(s.semanticVolatility * 100),
      lexicalDiversity: Math.round(s.lexicalDiversity * 100),
      polarizationDelta: Math.round(s.polarizationDelta * 100),
      echoChamberIndex: Math.round(s.echoChamberIndex * 100),
      topKeywords: s.topKeywords,
      sentimentDistribution: s.sentimentDistribution,
    })),
  }
}
