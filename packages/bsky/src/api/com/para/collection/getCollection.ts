import { type DatetimeString, lexParseJsonBytes } from '@atproto/lex'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.collection.getCollection, {
    auth: ctx.authVerifier.standard,
    handler: async ({ params, auth }) => {
      const viewer = auth.credentials.iss

      const { collection } = await ctx.hydrator.dataplane.getCollectionByKey({
        actorDid: viewer,
        key: params.id,
      })

      if (!collection) {
        throw new InvalidRequestError('Collection not found', 'NotFound')
      }

      const col = lexParseJsonBytes(
        collection.payload,
      ) as unknown as com.para.collection.defs.Collection

      return {
        encoding: 'application/json',
        body: {
          collection: {
            id: col.id,
            name: col.name,
            description: col.description,
            color: col.color,
            items: col.items || [],
            relations: col.relations || [],
            createdAt: (
              collection.createdAt?.toDate() ?? new Date(0)
            ).toISOString() as DatetimeString,
            updatedAt: (
              collection.updatedAt?.toDate() ?? new Date(0)
            ).toISOString() as DatetimeString,
          },
        },
      }
    },
  })
}
