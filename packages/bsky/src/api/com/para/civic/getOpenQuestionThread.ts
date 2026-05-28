// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import {
  QueryParams,
  ReplyView,
} from '../../../../lexicon/types/com/para/civic/getOpenQuestionThread.js'
import { Views } from '../../../../views/index.js'
import { resHeaders } from '../../../util.js'

const DEFAULT_DEPTH = 6

export default function (server: Server, ctx: AppContext) {
  server.com.para.civic.getOpenQuestionThread({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer, includeTakedowns } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns,
      })

      const result = await getOpenQuestionThread({
        ctx,
        params: { ...params, hydrateCtx },
        viewer: viewer ?? undefined,
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

const getOpenQuestionThread = async (inputs: {
  ctx: Context
  params: Params
  viewer?: string
}) => {
  const { ctx, params, viewer } = inputs
  const anchor = await ctx.hydrator.resolveUri(params.uri)
  const res = await ctx.dataplane.getParaOpenQuestionThread({
    postUri: anchor,
    depth: params.depth ?? DEFAULT_DEPTH,
    viewerDid: viewer ?? '',
  })

  if (!res.post) {
    throw new InvalidRequestError(`Question not found: ${anchor}`, 'NotFound')
  }

  const authors = [res.post.author, ...collectReplyAuthors(res.replies)]
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

  if (shouldHide(res.post.author)) {
    throw new InvalidRequestError(`Question not found: ${anchor}`, 'NotFound')
  }

  return {
    post: {
      uri: res.post.uri,
      cid: res.post.cid,
      author: res.post.author,
      text: res.post.text,
      createdAt: res.post.createdAt,
      replyRoot: parseString(res.post.replyRoot),
      replyParent: parseString(res.post.replyParent),
      langs: res.post.langs.length ? res.post.langs : undefined,
      tags: res.post.tags.length ? res.post.tags : undefined,
      flairs: res.post.flairs.length ? res.post.flairs : undefined,
      postType: parseString(res.post.postType),
    },
    replies: mapReplies(res.replies, shouldHide),
  }
}

const collectReplyAuthors = (
  replies: Array<{ author: string; replies: unknown[] }>,
): string[] => {
  return replies.flatMap((reply) => [
    reply.author,
    ...collectReplyAuthors(
      reply.replies as Array<{ author: string; replies: unknown[] }>,
    ),
  ])
}

const mapReplies = (
  replies: Array<{
    uri: string
    cid: string
    author: string
    text: string
    createdAt: string
    voteScore: number
    viewerVote: number
    replies: unknown[]
  }>,
  shouldHide: (authorDid: string) => boolean,
): ReplyView[] => {
  return replies
    .filter((reply) => !shouldHide(reply.author))
    .map((reply) => ({
      uri: reply.uri,
      cid: reply.cid,
      author: reply.author,
      text: reply.text,
      createdAt: reply.createdAt,
      voteScore: reply.voteScore,
      viewerVote: reply.viewerVote,
      replies: mapReplies(
        reply.replies as Parameters<typeof mapReplies>[0],
        shouldHide,
      ),
    }))
}

type Context = {
  dataplane: {
    getParaOpenQuestionThread: (req: {
      postUri: string
      depth: number
      viewerDid: string
    }) => Promise<{
      post?: {
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
      }
      replies: Parameters<typeof mapReplies>[0]
    }>
  }
  hydrator: Hydrator
  views: Views
}

type Params = QueryParams & {
  hydrateCtx: HydrateCtx
}
