import * as crypto from '@atproto/crypto'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { buildInviteCode, normalizeState } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.alpha.createInvite({
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ input, auth }) => {
      // @TODO: add proper admin role check via auth credentials
      const did = auth.credentials.did
      const state = input.body.state
      const count = input.body.count ?? 1

      const normalizedState = state.trim().toUpperCase()
      const isFriend = normalizedState === 'FRIEND'

      if (!isFriend) {
        normalizeState(state) // validate real state
      }

      const now = new Date().toISOString()
      const codes: string[] = []

      for (let i = 0; i < count; i++) {
        const code = isFriend
          ? `FRIEND-${crypto.randomStr(4, 'base32').toUpperCase()}-${crypto.randomStr(4, 'base32').toUpperCase()}`
          : buildInviteCode(normalizedState)

        await ctx.accountManager.db.db
          .insertInto('alpha_invite')
          .values({
            code,
            state: isFriend ? 'FRIEND' : normalizedState,
            did: null,
            createdBy: did,
            createdAt: now as any,
            usedAt: null,
          })
          .execute()
        codes.push(code)
      }

      return {
        encoding: 'application/json' as const,
        body: {
          codes,
          state: isFriend ? 'FRIEND' : normalizedState,
        },
      }
    },
  })
}
