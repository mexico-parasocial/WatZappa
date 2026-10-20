import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { Namespaces } from '../../../../stash.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.collection.updateCollection, {
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      const actorDid = auth.credentials.iss
      const { id, collection } = input.body

      await ctx.stashClient.update({
        actorDid,
        namespace: Namespaces.ComParaCollectionDefsCollection,
        payload: collection as unknown as NonNullable<
          Parameters<typeof ctx.stashClient.update>[0]['payload']
        >,
        key: id,
      })
    },
  })
}
