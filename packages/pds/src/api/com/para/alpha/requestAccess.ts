// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { requestAlphaAccess } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.alpha.requestAccess({
    auth: ctx.authVerifier.standardOptional,
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const state = input.body.state
      const inviteCode = input.body.inviteCode

      if (!state || typeof state !== 'string') {
        throw new InvalidRequestError('State is required.')
      }

      const result = await requestAlphaAccess(
        ctx.accountManager.db,
        did,
        state,
        inviteCode,
      )

      return {
        encoding: 'application/json' as const,
        body: {
          status: result.status,
          position: result.position,
          state: result.state,
        },
      }
    },
  })
}
