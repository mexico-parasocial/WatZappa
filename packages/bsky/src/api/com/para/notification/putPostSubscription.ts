import type { DatetimeString } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { app, com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.notification.putPostSubscription, {
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
        encoding: 'application/json',
        body: {
          post,
          reply: subscription?.reply ?? false,
          quote: subscription?.quote ?? false,
          indexedAt: subscription?.indexedAt?.toDate().toISOString() as
            DatetimeString | undefined,
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
    parsed.collection !== app.bsky.feed.post.$type &&
    parsed.collection !== com.para.post.$type
  ) {
    throw new InvalidRequestError(
      'Post subscription subject must be a post URI',
    )
  }
}
