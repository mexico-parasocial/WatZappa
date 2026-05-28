// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/actor/getProfileStats.js'
import { Views } from '../../../../views/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.actor.getProfileStats({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer, includeTakedowns } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns,
      })

      const result = await getProfileStats({
        ctx,
        params: { ...params, hydrateCtx },
      })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({
          repoRev,
          labelers: hydrateCtx.labelers,
        }),
      }
    },
  })
}

const getProfileStats = async (inputs: { ctx: Context; params: Params }) => {
  const { ctx, params } = inputs
  const [did] = await ctx.hydrator.actor.getDids([params.actor])
  if (!did) {
    throw new InvalidRequestError('Profile not found', 'NotFound')
  }

  const actors = await ctx.hydrator.actor.getActors([did], {
    includeTakedowns: params.hydrateCtx.includeTakedowns,
    skipCacheForDids: params.hydrateCtx.skipCacheForViewer,
  })
  const actor = actors.get(did)
  if (!actor) {
    throw new InvalidRequestError('Profile not found', 'NotFound')
  }

  const profileViewerState = await ctx.hydrator.hydrateProfileViewers(
    [actor.did],
    params.hydrateCtx,
  )
  const relationship = profileViewerState.profileViewers?.get(actor.did)
  if (
    relationship &&
    (relationship.blocking ||
      ctx.views.blockingByList(relationship, profileViewerState))
  ) {
    throw new InvalidRequestError(
      `Requester has blocked actor: ${actor.did}`,
      'BlockedActor',
    )
  }
  if (
    relationship &&
    (relationship.blockedBy ||
      ctx.views.blockedByList(relationship, profileViewerState))
  ) {
    throw new InvalidRequestError(
      `Requester is blocked by actor: ${actor.did}`,
      'BlockedByActor',
    )
  }

  const cache = ctx.paraCache
  const cacheKey = cache?.profileStatsKey(did)
  if (cache && cacheKey) {
    const cached = await cache.get(cacheKey, 'profileStats')
    if (cached) return cached
  }

  const res = await ctx.dataplane.getParaProfileStats({ actorDid: did })
  const computedAt =
    parseString(res.stats?.computedAt) ?? new Date().toISOString()

  const result = {
    actor: did,
    stats: {
      influence: res.stats?.influence ?? 0,
      votesReceivedAllTime: res.stats?.votesReceivedAllTime ?? 0,
      votesCastAllTime: res.stats?.votesCastAllTime ?? 0,
      contributions: {
        policies: res.stats?.contributions?.policies ?? 0,
        matters: res.stats?.contributions?.matters ?? 0,
        comments: res.stats?.contributions?.comments ?? 0,
      },
      activeIn: res.stats?.activeIn ?? [],
      computedAt,
    },
    status: res.status
      ? {
          status: res.status.status,
          party: parseString(res.status.party),
          community: parseString(res.status.community),
          createdAt: res.status.createdAt,
        }
      : undefined,
  }

  if (cache && cacheKey) {
    await cache.set(cacheKey, 'profileStats', result)
  }
  return result
}

type Context = {
  dataplane: DataPlaneClient
  hydrator: Hydrator
  views: Views
  paraCache?: import('../../../../cache/para-cache.js').ParaCacheService
}

type Params = QueryParams & {
  hydrateCtx: HydrateCtx
}
