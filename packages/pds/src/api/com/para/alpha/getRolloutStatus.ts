// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.alpha.getRolloutStatus({
    auth: ctx.authVerifier.standardOptional,
    handler: async () => {
      const rows = await ctx.accountManager.db.db
        .selectFrom('alpha_rollout')
        .selectAll()
        .orderBy('state')
        .execute()

      return {
        encoding: 'application/json' as const,
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
