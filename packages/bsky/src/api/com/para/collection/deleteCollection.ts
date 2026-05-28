import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { Namespaces } from '../../../../stash.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.collection.deleteCollection({
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      const actorDid = auth.credentials.iss
      const { id } = input.body

      await ctx.stashClient.delete({
        actorDid,
        namespace: Namespaces.ComParaCollectionDefsCollection,
        key: id,
      })
    },
  })
}
