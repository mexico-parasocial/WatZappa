// @ts-nocheck
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.discourse.getSnapshot, {
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
  params: com.para.discourse.getSnapshot.$Params
}) => {
  const { ctx } = inputs
  // @NOTE The lexicon declares only `subject`, so `community` and `timeframe`
  // never reached this handler; keep sending the defaults they resolved to.
  const res = await ctx.dataplane.getParaDiscourseSnapshot({
    community: '',
    timeframe: undefined,
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
