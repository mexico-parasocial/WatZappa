// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.discourse.getSentiment({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const result = await getDiscourseSentiment({
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

const getDiscourseSentiment = async (inputs: {
  ctx: AppContext
  params: { community?: string; timeframe?: string }
}) => {
  const { ctx, params } = inputs
  const res = await ctx.dataplane.getParaDiscourseSentiment({
    community: params.community ?? '',
    timeframe: params.timeframe,
  })

  // Ensure and scale distribution
  const sentiment = res.sentiment || {
    anger: 0,
    fear: 0,
    trust: 0,
    uncertainty: 0,
    neutral: 0,
  }

  return {
    sentiment: {
      anger: Math.round(sentiment.anger * 100),
      fear: Math.round(sentiment.fear * 100),
      trust: Math.round(sentiment.trust * 100),
      uncertainty: Math.round(sentiment.uncertainty * 100),
      neutral: Math.round(sentiment.neutral * 100),
    },
  }
}
