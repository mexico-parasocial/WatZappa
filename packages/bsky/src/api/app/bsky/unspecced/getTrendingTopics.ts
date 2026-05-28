import { noUndefinedVals } from '@atproto/common'
import { Client } from '@atproto/lex'
import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/client/index.js'
import { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { app } from '../../../../lexicons/index.js'
import {
  HydrationFn,
  PresentationFn,
  RulesFn,
  SkeletonFn,
  createPipeline,
} from '../../../../pipeline.js'
import { Views } from '../../../../views/index.js'

export default function (server: Server, ctx: AppContext) {
  const getTrendingTopics = createPipeline(
    skeleton,
    hydration,
    noBlocksOrMutes,
    presentation,
  )
  server.add(app.bsky.unspecced.getTrendingTopics, {
    auth: ctx.authVerifier.standardOptional,
    handler: async ({ auth, params, req }) => {
      const viewer = auth.credentials.iss
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({ labelers, viewer })
      const headers = noUndefinedVals({
        'accept-language': req.headers['accept-language'],
      })
      const result = await getTrendingTopics(
        {
          ...params,
          hydrateCtx,
          headers,
        },
        ctx,
      )
      return {
        encoding: 'application/json',
        body: result,
      }
    },
  })
}

const skeleton: SkeletonFn<Context, Params, SkeletonState> = async (input) => {
  const { params, ctx } = input

  if (ctx.topicsClient) {
    return ctx.topicsClient.call(
      app.bsky.unspecced.getTrendingTopics,
      {
        limit: params.limit,
        viewer: params.hydrateCtx.viewer ?? undefined,
      },
      {
        headers: params.headers,
      },
    )
  }

  // PARA-native fallback: query discourse topics from the dataplane
  const res = await ctx.dataplane.getParaTrendingTopics({
    limit: params.limit ?? 14,
    timeframe: '24h',
  })

  const parsed = JSON.parse(res.topicsJson)
  return {
    topics: parsed.topics ?? [],
    suggested: parsed.suggested ?? [],
  }
}

const hydration: HydrationFn<Context, Params, SkeletonState> = async () => {
  return {}
}

const noBlocksOrMutes: RulesFn<Context, Params, SkeletonState> = (input) => {
  return input.skeleton
}

const presentation: PresentationFn<
  Context,
  Params,
  SkeletonState,
  SkeletonState
> = (input) => {
  return input.skeleton
}

type Context = {
  hydrator: Hydrator
  views: Views
  topicsClient: Client | undefined
  dataplane: DataPlaneClient
}

type Params = Omit<app.bsky.unspecced.getTrendingTopics.$Params, 'viewer'> & {
  hydrateCtx: HydrateCtx
  headers: Record<string, string>
}

type SkeletonState = app.bsky.unspecced.getTrendingTopics.$OutputBody
