// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { getAlphaAccess } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.alpha.getAccess({
    auth: ctx.authVerifier.standardOptional,
    handler: async ({ auth }) => {
      const did = auth.credentials.did
      const access = await getAlphaAccess(ctx.accountManager.db, did)

      if (access.hasAccess) {
        return {
          encoding: 'application/json' as const,
          body: {
            hasAccess: true,
            state: access.state,
          },
        }
      }

      return {
        encoding: 'application/json' as const,
        body: {
          hasAccess: false,
          state: access.state,
          waitlistPosition: access.waitlistPosition,
        },
      }
    },
  })
}
