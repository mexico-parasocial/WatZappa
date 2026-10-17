import { Code, ConnectError } from '@connectrpc/connect'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../../context.js'
import type { Server } from '../../../../../lexicon/index.js'
import { parseDataplaneJson } from '../civicTree/util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.community.getActivity', {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const uri = String(params.uri ?? '')
      try {
        const res = await ctx.dataplane.getParaCommunityActivity({ uri })
        return {
          encoding: 'application/json' as const,
          body: {
            activity: parseDataplaneJson(res.activityJson, null),
            ledger: parseDataplaneJson(res.ledgerJson, []),
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
