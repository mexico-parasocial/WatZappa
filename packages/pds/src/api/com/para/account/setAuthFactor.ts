import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.account.setAuthFactor({
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const authFactorType = input.body.authFactorType ?? null

      if (authFactorType !== null && authFactorType !== 'im8') {
        throw new InvalidRequestError(
          'Unsupported auth factor type. Currently only "im8" is supported.',
        )
      }

      const account = await ctx.accountManager.updateAuthFactorType(
        did,
        authFactorType,
      )

      return {
        encoding: 'application/json' as const,
        body: {
          authFactorType: account.authFactorType ?? undefined,
        },
      }
    },
  })
}
