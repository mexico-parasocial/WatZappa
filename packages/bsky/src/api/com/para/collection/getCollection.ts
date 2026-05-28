import { lexParseJsonBytes } from '@atproto/lex'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import * as ComParaCollectionDefs from '../../../../lexicon/types/com/para/collection/defs.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.collection.getCollection({
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
      ) as unknown as ComParaCollectionDefs.Collection

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
            ).toISOString(),
            updatedAt: (
              collection.updatedAt?.toDate() ?? new Date(0)
            ).toISOString(),
          },
        },
      }
    },
  })
}
