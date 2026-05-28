// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/feed/getAuthorFeed.js'
import { Views } from '../../../../views/index.js'
import { clearlyBadCursor, resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.feed.getAuthorFeed({
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

const getAuthorFeed = async (inputs: { ctx: Context; params: Params }) => {
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
    const cached = await cache.get(cacheKey, 'authorFeed')
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
    feed: res.items.map((item) => ({
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
    })),
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
  paraCache?: import('../../../../cache/para-cache.js').ParaCacheService
}

type Params = QueryParams & {
  hydrateCtx: HydrateCtx
}
