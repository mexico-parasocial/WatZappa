import { type DatetimeString, lexParseJsonBytes } from '@atproto/lex'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.collection.listCollections, {
    auth: ctx.authVerifier.standard,
    handler: async ({ params, auth }) => {
      const viewer = auth.credentials.iss

      const { cursor, collections } =
        await ctx.hydrator.dataplane.getActorCollections({
          actorDid: viewer,
          limit: params.limit,
          cursor: params.cursor,
        })

      const collectionViews = collections.map((c) => {
        const collection = lexParseJsonBytes(
          c.payload,
        ) as unknown as com.para.collection.defs.Collection
        return {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          color: collection.color,
          items: collection.items || [],
          relations: collection.relations || [],
          createdAt: (
            c.createdAt?.toDate() ?? new Date(0)
          ).toISOString() as DatetimeString,
          updatedAt: (
            c.updatedAt?.toDate() ?? new Date(0)
          ).toISOString() as DatetimeString,
        }
      })

      return {
        encoding: 'application/json',
        body: {
          cursor,
          collections: collectionViews,
        },
      }
    },
  })
}
