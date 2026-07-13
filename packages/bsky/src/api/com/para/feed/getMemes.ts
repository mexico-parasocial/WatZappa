import { AtUriString, DidString } from '@atproto/lex'
import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import { Views } from '../../../../views/index.js'
import { clearlyBadCursor, resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.feed.getMemes, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer, includeTakedowns, skipViewerBlocks } =
        ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns,
        skipViewerBlocks,
      })

      const result = await getMemes({
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

const getMemes = async (inputs: { ctx: Context; params: Params }) => {
  const { ctx, params } = inputs
  if (clearlyBadCursor(params.cursor)) {
    return { feed: [] }
  }

  const res = await ctx.dataplane.getParaMemes({
    limit: params.limit,
    cursor: params.cursor,
    viewerDid: params.hydrateCtx.viewer ?? '',
    party: params.party,
    community: params.community,
    state: params.state,
    category: params.category,
    flairTag: params.flairTag,
  })

  const uris = res.items.map((item) => item.uri as AtUriString)
  if (!uris.length) {
    return { feed: [], cursor: parseString(res.cursor) }
  }

  const hydration = await ctx.hydrator.hydratePosts(
    uris.map((uri) => ({ uri })),
    params.hydrateCtx,
  )

  const metas = await Promise.all(
    uris.map((postUri) => ctx.dataplane.getParaPostMeta({ postUri })),
  )

  const feed = uris
    .map((uri, i) => {
      const postView = ctx.views.post(uri, hydration)
      if (!postView) return undefined
      const meta = metas[i]?.post
      if (!meta) return undefined
      const authorDid = meta.author as DidString
      if (
        ctx.views.viewerBlockExists(authorDid, hydration) ||
        ctx.views.viewerMuteExists(authorDid, hydration)
      ) {
        return undefined
      }
      return {
        post: postView,
        meta: formatPostMeta(meta),
      }
    })
    .filter((item): item is NonNullable<typeof item> => !!item)

  return {
    feed,
    cursor: parseString(res.cursor),
  }
}

const formatPostMeta = (meta: {
  uri: string
  postType?: string
  official?: boolean
  party?: string
  community?: string
  category?: string
  tags: string[]
  flairs: string[]
  voteScore: number
  interactionMode?: string
  createdAt?: string
}): com.para.social.getPostMeta.$OutputBody => {
  return {
    uri: meta.uri as AtUriString,
    postType: asPostType(meta.postType),
    official: meta.official,
    party: parseString(meta.party),
    community: parseString(meta.community),
    category: parseString(meta.category),
    tags: meta.tags.length ? meta.tags : undefined,
    flairs: meta.flairs.length ? meta.flairs : undefined,
    voteScore: meta.voteScore,
    interactionMode: asInteractionMode(meta.interactionMode),
    createdAt: parseString(meta.createdAt) as
      | com.para.social.getPostMeta.PostMeta['createdAt']
      | undefined,
  }
}

const asPostType = (
  value?: string,
): 'policy' | 'matter' | 'meme' | undefined => {
  if (value === 'policy' || value === 'matter' || value === 'meme') {
    return value
  }
  return undefined
}

const asInteractionMode = (
  value?: string,
): 'policy_ballot' | 'reddit_votes' => {
  if (value === 'policy_ballot') {
    return 'policy_ballot'
  }
  return 'reddit_votes'
}

type Context = {
  dataplane: DataPlaneClient
  hydrator: Hydrator
  views: Views
}

type Params = com.para.feed.getMemes.$Params & {
  hydrateCtx: HydrateCtx
}
