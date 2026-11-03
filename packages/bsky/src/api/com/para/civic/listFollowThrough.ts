import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import {
  forwardDataplaneErrors,
  parseDataplaneJson,
} from '../community/civicTree/util.js'

/*
 * Compromisos of resolved cabildeos (Seguimiento). The data plane serves only
 * what a steward of the cabildeo's community wrote; see
 * data-plane/server/routes/follow-through.ts.
 */
export default function (server: Server, ctx: AppContext) {
  server.add(com.para.civic.listFollowThrough, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.getParaFollowThrough({
          cabildeoUri: params.cabildeo ?? '',
          communityUri: params.community ?? '',
          status: params.status ?? '',
          overdue: params.overdue === true,
          limit: params.limit ?? 25,
          cursor: params.cursor ?? '',
        }),
      )
      return {
        encoding: 'application/json' as const,
        body: {
          items: parseDataplaneJson<
            com.para.civic.listFollowThrough.$OutputBody['items']
          >(res.itemsJson, []),
          summaries: parseDataplaneJson<
            com.para.civic.listFollowThrough.$OutputBody['summaries']
          >(res.summariesJson, []),
          cursor: res.cursor || undefined,
        },
      }
    },
  })
}
