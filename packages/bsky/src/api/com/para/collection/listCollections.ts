import { lexParseJsonBytes } from '@atproto/lex'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import * as ComParaCollectionDefs from '../../../../lexicon/types/com/para/collection/defs.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.collection.listCollections({
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
        ) as unknown as ComParaCollectionDefs.Collection
        return {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          color: collection.color,
          items: collection.items || [],
          relations: collection.relations || [],
          createdAt: (c.createdAt?.toDate() ?? new Date(0)).toISOString(),
          updatedAt: (c.updatedAt?.toDate() ?? new Date(0)).toISOString(),
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
