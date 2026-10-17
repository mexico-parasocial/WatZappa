import type { AppContext } from '../../../../../context.js'
import type { Server } from '../../../../../lexicon/index.js'
import {
  forwardDataplaneErrors,
  parseDataplaneJson,
} from '../civicTree/util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.community.listWikiPages', {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.getParaCommunityWikiPages({
          communityUri: String(params.community ?? ''),
          kind: String(params.kind ?? ''),
        }),
      )
      return {
        encoding: 'application/json' as const,
        body: { pages: parseDataplaneJson(res.itemsJson, []) },
      }
    },
  })
}
