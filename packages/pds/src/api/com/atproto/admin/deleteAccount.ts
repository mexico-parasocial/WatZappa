import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.admin.deleteAccount, {
    auth: ctx.authVerifier.adminToken,
    handler: async ({ input }) => {
      const { did } = input.body
      await ctx.actorStore.destroy(did)
      await ctx.accountManager.deleteAccount(did)
      await ctx.sequencer.sequenceAccountDeletion(did)
    },
  })
}
