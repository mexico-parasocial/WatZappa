// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/social/getPostMeta.js'
import { Views } from '../../../../views/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.social.getPostMeta({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer, includeTakedowns } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns,
      })

      const result = await getPostMeta({
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

const getPostMeta = async (inputs: { ctx: Context; params: Params }) => {
  const { ctx, params } = inputs
  const post = await ctx.hydrator.resolveUri(params.post)

  const meta = await ctx.dataplane.getParaPostMeta({ postUri: post })
  if (!meta.post) {
    throw new InvalidRequestError(`Post not found: ${post}`, 'NotFound')
  }

  const hydration = await ctx.hydrator.hydrateProfileViewers(
    [meta.post.author],
    params.hydrateCtx,
  )
  const shouldHide =
    ctx.views.viewerBlockExists(meta.post.author, hydration) ||
    ctx.views.viewerMuteExists(meta.post.author, hydration)
  if (shouldHide) {
    throw new InvalidRequestError(`Post not found: ${post}`, 'NotFound')
  }

  const postType = asPostType(meta.post.postType)
  const interactionMode = asInteractionMode(meta.post.interactionMode)

  return {
    uri: meta.post.uri,
    postType,
    official: meta.post.official,
    party: parseString(meta.post.party),
    community: parseString(meta.post.community),
    category: parseString(meta.post.category),
    tags: meta.post.tags.length ? meta.post.tags : undefined,
    flairs: meta.post.flairs.length ? meta.post.flairs : undefined,
    voteScore: meta.post.voteScore,
    interactionMode,
    createdAt: parseString(meta.post.createdAt),
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

type Params = QueryParams & {
  hydrateCtx: HydrateCtx
}
