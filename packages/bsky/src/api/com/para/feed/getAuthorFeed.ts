import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { ParaCacheService } from '../../../../cache/para-cache.js'
import type { AppContext } from '../../../../context.js'
import type { DataPlaneClient } from '../../../../data-plane/index.js'
import type { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import type { Views } from '../../../../views/index.js'
import { clearlyBadCursor, resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.feed.getAuthorFeed, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer, includeTakedowns } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns,
      })

      const result = await getAuthorFeed({
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

const getAuthorFeed = async (inputs: {
  ctx: Context
  params: Params
}): Promise<com.para.feed.getAuthorFeed.$OutputBody> => {
  const { ctx, params } = inputs
  const [did] = await ctx.hydrator.actor.getDids([params.actor])
  if (!did) {
    throw new InvalidRequestError('Profile not found')
  }

  const actors = await ctx.hydrator.actor.getActors([did], {
    includeTakedowns: params.hydrateCtx.includeTakedowns,
    skipCacheForDids: params.hydrateCtx.skipCacheForViewer,
  })
  const actor = actors.get(did)
  if (!actor) {
    throw new InvalidRequestError('Profile not found')
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

  if (clearlyBadCursor(params.cursor)) {
    return { feed: [] }
  }

  const cache = ctx.paraCache
  const cacheKey = cache?.authorFeedKey({
    actorDid: did,
    limit: params.limit,
    cursor: params.cursor ?? '',
    party: params.party ?? '',
    community: params.community ?? '',
    flairTag: params.flairTag ?? '',
    postType: params.postType ?? '',
  })
  if (cache && cacheKey) {
    const cached = await cache.get<com.para.feed.getAuthorFeed.$OutputBody>(
      cacheKey,
      'authorFeed',
    )
    if (cached) return cached
  }

  const res = await ctx.dataplane.getParaAuthorFeed({
    actorDid: did,
    limit: params.limit,
    cursor: params.cursor,
    party: params.party,
    community: params.community,
    flairTag: params.flairTag,
    postType: params.postType,
  })

  const result = {
    feed: res.items.map(
      (item) =>
        ({
          uri: item.uri,
          cid: item.cid,
          author: item.author,
          text: item.text,
          createdAt: item.createdAt,
          replyRoot: parseString(item.replyRoot),
          replyParent: parseString(item.replyParent),
          langs: item.langs.length ? item.langs : undefined,
          tags: item.tags.length ? item.tags : undefined,
          flairs: item.flairs.length ? item.flairs : undefined,
          postType: parseString(item.postType),
        }) as com.para.feed.getAuthorFeed.PostView,
    ),
    cursor: parseString(res.cursor),
  }

  if (cache && cacheKey) {
    await cache.set(cacheKey, 'authorFeed', result)
  }
  return result
}

type Context = {
  hydrator: Hydrator
  dataplane: DataPlaneClient
  views: Views
  paraCache?: ParaCacheService
}

type Params = com.para.feed.getAuthorFeed.$Params & {
  hydrateCtx: HydrateCtx
}
