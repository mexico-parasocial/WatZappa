import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { computeProxyTo } from '../../../../pipethrough.js'
import {
  type MungeFn,
  pipethroughReadAfterWrite,
} from '../../../../read-after-write/index.js'
import { insertLocalPostsInFeed, resolveLocalActorDid } from './util.js'

/** Read-after-write for the viewer's own `com.para.post` records. */
export function getTimeline(server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.add(com.para.feed.getTimeline, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = com.para.feed.getTimeline.$lxm
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      return pipethroughReadAfterWrite(
        ctx,
        reqCtx,
        com.para.feed.getTimeline,
        getTimelineMunge,
      )
    },
  })
}

const getTimelineMunge: MungeFn<
  com.para.feed.getTimeline.$OutputBody
> = async (_localViewer, original, local) => ({
  ...original,
  feed: insertLocalPostsInFeed([...original.feed], local.paraPosts),
})

export function getAuthorFeed(server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.add(com.para.feed.getAuthorFeed, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = com.para.feed.getAuthorFeed.$lxm
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      const actorDid = await resolveLocalActorDid(ctx, reqCtx.params.actor)
      return pipethroughReadAfterWrite(
        ctx,
        reqCtx,
        com.para.feed.getAuthorFeed,
        getAuthorFeedMunge(actorDid),
      )
    },
  })
}

const getAuthorFeedMunge =
  (actorDid?: string): MungeFn<com.para.feed.getAuthorFeed.$OutputBody> =>
  async (_localViewer, original, local, requester) => {
    // Only the viewer's own feed can contain their unindexed posts.
    if (!actorDid || actorDid !== requester) return original
    return {
      ...original,
      feed: insertLocalPostsInFeed([...original.feed], local.paraPosts),
    }
  }
