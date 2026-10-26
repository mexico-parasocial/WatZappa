import type { DidString } from '@atproto/lex'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import type { DataPlaneClient } from '../../../../data-plane/index.js'
import type {
  HydrateCtx,
  HydrationState,
  Hydrator,
} from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import type { Views } from '../../../../views/index.js'
import { clearlyBadCursor, resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.feed.getTimeline, {
    auth: ctx.authVerifier.standard,
    handler: async ({ params, auth, req }) => {
      const viewer = auth.credentials.iss
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({ labelers, viewer })

      const result = await getTimeline({
        ctx,
        params: { ...params, hydrateCtx: hydrateCtx.copy({ viewer }) },
      })

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({ labelers: hydrateCtx.labelers, repoRev }),
      }
    },
  })
}

const getTimeline = async (inputs: { ctx: Context; params: Params }) => {
  const { ctx, params } = inputs
  if (clearlyBadCursor(params.cursor)) {
    return { feed: [] }
  }

  const res = await ctx.dataplane.getParaTimeline({
    actorDid: params.hydrateCtx.viewer,
    limit: params.limit,
    cursor: params.cursor,
    party: params.party,
    community: params.community,
    flairTag: params.flairTag,
    postType: params.postType,
  })

  const authors = [
    ...new Set(res.items.map((item) => item.author as DidString)),
  ]
  const hydration = await ctx.hydrator.hydrateProfileViewers(
    authors,
    params.hydrateCtx,
  )

  return {
    feed: res.items
      .filter((item) => !shouldHide(item.author, ctx.views, hydration))
      .map(
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
}

const shouldHide = (
  authorDid: string,
  views: Views,
  hydration: HydrationState,
) => {
  return (
    views.viewerBlockExists(authorDid as DidString, hydration) ||
    views.viewerMuteExists(authorDid as DidString, hydration)
  )
}

type Context = {
  hydrator: Hydrator
  views: Views
  dataplane: DataPlaneClient
}

type Params = com.para.feed.getTimeline.$Params & {
  hydrateCtx: HydrateCtx & { viewer: string }
}
