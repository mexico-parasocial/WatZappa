import { Timestamp } from '@bufbuild/protobuf'
import { ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import {
  PostSubscription,
  PutPostSubscriptionResponse,
} from '../../../proto/bsky_pb.js'
import { Database } from '../db/index.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getPostSubscription(req) {
    const subscription = await db.db
      .selectFrom('post_subscription')
      .selectAll()
      .where('subscriberDid', '=', req.subscriberDid)
      .where('postUri', '=', req.postUri)
      .executeTakeFirst()

    return {
      subscription: subscription ? toProto(subscription) : undefined,
    }
  },

  async putPostSubscription(req) {
    const enabled = req.reply || req.quote

    if (!enabled) {
      await db.db
        .deleteFrom('post_subscription')
        .where('subscriberDid', '=', req.subscriberDid)
        .where('postUri', '=', req.postUri)
        .execute()
      return new PutPostSubscriptionResponse()
    }

    const indexedAt = new Date().toISOString()
    const subscription = await db.db
      .insertInto('post_subscription')
      .values({
        subscriberDid: req.subscriberDid,
        postUri: req.postUri,
        indexedAt,
        reply: req.reply,
        quote: req.quote,
      })
      .onConflict((oc) =>
        oc.columns(['subscriberDid', 'postUri']).doUpdateSet({
          indexedAt,
          reply: req.reply,
          quote: req.quote,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()

    return {
      subscription: toProto(subscription),
    }
  },
})

const toProto = (subscription: {
  subscriberDid: string
  postUri: string
  reply: boolean
  quote: boolean
  indexedAt: string
}) =>
  new PostSubscription({
    subscriberDid: subscription.subscriberDid,
    postUri: subscription.postUri,
    reply: subscription.reply,
    quote: subscription.quote,
    indexedAt: Timestamp.fromDate(new Date(subscription.indexedAt)),
  })
