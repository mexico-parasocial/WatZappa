// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { forwardDataplaneErrors, parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.community.civicTree.listContributions', {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)

      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.getParaCommunityCivicTreeContributions({
          communityUri: params.community,
          status: params.status ?? '',
          // The authenticated viewer wins over the param; anonymous callers
          // can still resolve votes for a DID they explicitly pass.
          viewerDid: viewer ?? params.viewer ?? '',
          limit: params.limit,
          cursor: params.cursor ?? '',
        }),
      )

      return {
        encoding: 'application/json' as const,
        body: {
          contributions: parseDataplaneJson(res.itemsJson, []),
          cursor: res.cursor || undefined,
        },
      }
    },
  })
}
