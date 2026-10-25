import * as crypto from '@atproto/crypto'
import type { DatetimeString } from '@atproto/lex'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import {
  buildInviteCode,
  getAlphaAccess,
  normalizeState,
  requestAlphaAccess,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  // Admin-only, per the lexicon: invite codes bypass the per-state quotas.
  server.add(com.para.alpha.createInvite, {
    auth: ctx.authVerifier.adminToken,
    handler: async ({ input }) => {
      const { state } = input.body
      const count = input.body.count ?? 1

      const normalizedState = state.trim().toUpperCase()
      const isFriend = normalizedState === 'FRIEND'
      if (!isFriend) {
        normalizeState(state) // validate real state
      }

      const inviteState = isFriend ? 'FRIEND' : normalizedState
      const now = new Date().toISOString() as DatetimeString
      const codes: string[] = []

      for (let i = 0; i < count; i++) {
        const code = isFriend
          ? `FRIEND-${crypto.randomStr(4, 'base32').toUpperCase()}-${crypto.randomStr(4, 'base32').toUpperCase()}`
          : buildInviteCode(normalizedState)

        await ctx.accountManager.db.db
          .insertInto('alpha_invite')
          .values({
            code,
            state: inviteState,
            did: null,
            createdBy: ctx.cfg.service.did,
            createdAt: now,
            usedAt: null,
          })
          .execute()
        codes.push(code)
      }

      return {
        encoding: 'application/json',
        body: { codes, state: inviteState },
      }
    },
  })

  server.add(com.para.alpha.getAccess, {
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ auth }) => {
      const access = await getAlphaAccess(
        ctx.accountManager.db,
        auth.credentials.did,
      )
      return {
        encoding: 'application/json',
        body: access.hasAccess
          ? { hasAccess: true, state: access.state }
          : {
              hasAccess: false,
              state: access.state,
              waitlistPosition: access.waitlistPosition,
            },
      }
    },
  })

  server.add(com.para.alpha.requestAccess, {
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ input, auth }) => {
      const { state, inviteCode } = input.body
      if (!state || typeof state !== 'string') {
        throw new InvalidRequestError('State is required.')
      }

      const result = await requestAlphaAccess(
        ctx.accountManager.db,
        auth.credentials.did,
        state,
        inviteCode,
      )
      return {
        encoding: 'application/json',
        body: {
          status: result.status,
          position: result.position,
          state: result.state,
        },
      }
    },
  })

  server.add(com.para.alpha.getRolloutStatus, {
    auth: ctx.authVerifier.unauthenticated,
    handler: async () => {
      const rows = await ctx.accountManager.db.db
        .selectFrom('alpha_rollout')
        .selectAll()
        .orderBy('state')
        .execute()

      return {
        encoding: 'application/json',
        body: {
          states: rows.map((r) => ({
            state: r.state,
            totalSlots: r.totalSlots,
            usedSlots: r.usedSlots,
            isOpen: r.isOpen === 1,
            openedAt: r.openedAt ?? undefined,
          })),
        },
      }
    },
  })
}
