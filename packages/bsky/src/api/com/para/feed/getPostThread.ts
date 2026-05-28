// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/feed/getPostThread.js'
import { Views } from '../../../../views/index.js'
import { resHeaders } from '../../../util.js'

const DEFAULT_DEPTH = 6
const DEFAULT_PARENT_HEIGHT = 80

export default function (server: Server, ctx: AppContext) {
  server.com.para.feed.getPostThread({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer, includeTakedowns } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns,
      })

      const result = await getPostThread({
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

const getPostThread = async (inputs: { ctx: Context; params: Params }) => {
  const { ctx, params } = inputs
  const anchor = await ctx.hydrator.resolveUri(params.uri)
  const depth = params.depth ?? DEFAULT_DEPTH
  const parentHeight = params.parentHeight ?? DEFAULT_PARENT_HEIGHT

  const thread = await ctx.dataplane.getParaThread({
    postUri: anchor,
    above: parentHeight,
    below: depth,
  })

  if (!thread.post) {
    throw new InvalidRequestError(`Post not found: ${anchor}`, 'NotFound')
  }

  const authors = [
    thread.post.author,
    ...thread.parents.map((item) => item.author),
    ...thread.replies.map((item) => item.author),
  ]
  const hydration = await ctx.hydrator.hydrateProfileViewers(
    [...new Set(authors)],
    params.hydrateCtx,
  )

  const shouldHide = (authorDid: string) => {
    return (
      ctx.views.viewerBlockExists(authorDid, hydration) ||
      ctx.views.viewerMuteExists(authorDid, hydration)
    )
  }

  if (shouldHide(thread.post.author)) {
    throw new InvalidRequestError(`Post not found: ${anchor}`, 'NotFound')
  }

  const rootUri = thread.post.replyRoot ?? thread.post.uri
  const isOnRoot = (item: { uri: string; replyRoot?: string }) =>
    item.uri === rootUri || item.replyRoot === rootUri

  return {
    post: mapPost(thread.post),
    parents: thread.parents
      .filter((item) => isOnRoot(item) && !shouldHide(item.author))
      .map(mapPost),
    replies: thread.replies
      .filter((item) => isOnRoot(item) && !shouldHide(item.author))
      .map(mapPost),
  }
}

const mapPost = (item: {
  uri: string
  cid: string
  author: string
  text: string
  createdAt: string
  replyRoot?: string
  replyParent?: string
  langs: string[]
  tags: string[]
  flairs: string[]
  postType?: string
}) => ({
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
})

type Context = {
  dataplane: DataPlaneClient
  hydrator: Hydrator
  views: Views
}

type Params = QueryParams & {
  hydrateCtx: HydrateCtx
}
