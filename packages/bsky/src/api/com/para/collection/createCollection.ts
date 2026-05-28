import { TID } from '@atproto/common'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { Namespaces } from '../../../../stash.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.collection.createCollection({
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      const actorDid = auth.credentials.iss
      const { name, description, color } = input.body
      const id = TID.nextStr()

      const collection = {
        id,
        name,
        description,
        color,
        items: [],
        relations: [],
      }

      await ctx.stashClient.create({
        actorDid,
        namespace: Namespaces.ComParaCollectionDefsCollection,
        payload: collection,
        key: id,
      })

      return {
        encoding: 'application/json',
        body: { id },
      }
    },
  })
}
