import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.account.getAuthFactor, {
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ auth }) => {
      const account = await ctx.accountManager.getAccount(
        auth.credentials.did,
      )
      return {
        encoding: 'application/json',
        body: {
          authFactorType: account?.authFactorType ?? undefined,
        },
      }
    },
  })

  server.add(com.para.account.setAuthFactor, {
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ input, auth }) => {
      const authFactorType = input.body.authFactorType ?? null
      if (authFactorType !== null && authFactorType !== 'im8') {
        throw new InvalidRequestError(
          'Unsupported auth factor type. Currently only "im8" is supported.',
        )
      }

      const account = await ctx.accountManager.updateAuthFactorType(
        auth.credentials.did,
        authFactorType as 'im8' | null,
      )
      return {
        encoding: 'application/json',
        body: {
          authFactorType: account.authFactorType ?? undefined,
        },
      }
    },
  })
}
