// @ts-nocheck
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.notification.putPostSubscription', {
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      const actorDid = auth.credentials.iss
      const { post, reply, quote } = input.body
      assertPostUri(post)

      const res = await ctx.dataplane.putPostSubscription({
        subscriberDid: actorDid,
        postUri: post,
        reply,
        quote,
      })
      const subscription = res.subscription

      return {
        encoding: 'application/json' as const,
        body: {
          post,
          reply: subscription?.reply ?? false,
          quote: subscription?.quote ?? false,
          indexedAt: subscription?.indexedAt?.toDate().toISOString(),
        },
      }
    },
  })
}

const assertPostUri = (uri: string) => {
  let parsed: AtUri
  try {
    parsed = new AtUri(uri)
  } catch {
    throw new InvalidRequestError('Invalid post URI')
  }
  if (
    parsed.collection !== 'app.bsky.feed.post' &&
    parsed.collection !== 'com.para.post'
  ) {
    throw new InvalidRequestError(
      'Post subscription subject must be a post URI',
    )
  }
}
