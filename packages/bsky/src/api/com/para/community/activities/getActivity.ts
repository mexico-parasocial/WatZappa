import { Code, ConnectError } from '@connectrpc/connect'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../../context.js'
import { com } from '../../../../../lexicons/index.js'
import { parseDataplaneJson } from '../civicTree/util.js'

type ActivityView = com.para.community.listActivities.ActivityView
type LedgerEntryView = com.para.community.getActivity.LedgerEntryView

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.getActivity, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const uri = String(params.uri ?? '')
      try {
        const res = await ctx.dataplane.getParaCommunityActivity({ uri })
        return {
          encoding: 'application/json',
          body: {
            activity: parseDataplaneJson<ActivityView | null>(
              res.activityJson,
              null,
            ) as ActivityView,
            ledger: parseDataplaneJson<LedgerEntryView[]>(res.ledgerJson, []),
          },
        }
      } catch (err) {
        if (err instanceof ConnectError && err.code === Code.NotFound) {
          throw new InvalidRequestError('Activity not found', 'NotFound')
        }
        throw err
      }
    },
  })
}
