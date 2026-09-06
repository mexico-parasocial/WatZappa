import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.account.getAuthFactor({
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ auth }) => {
      const did = auth.credentials.did
      const account = await ctx.accountManager.getAccount(did)

      return {
        encoding: 'application/json' as const,
        body: {
          authFactorType: account?.authFactorType ?? undefined,
        },
      }
    },
  })
}
