import type { AppContext } from '../../../../../context.js'
import type { Server } from '../../../../../lexicon/index.js'
import {
  forwardDataplaneErrors,
  parseDataplaneJson,
} from '../civicTree/util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.community.listActivities', {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.getParaCommunityActivities({
          communityUri: String(params.community ?? ''),
          category: String(params.category ?? ''),
          time: String(params.time ?? 'any'),
          limit: Number(params.limit) || 25,
          cursor: String(params.cursor ?? ''),
        }),
      )
      return {
        encoding: 'application/json' as const,
        body: {
          activities: parseDataplaneJson(res.itemsJson, []),
          cursor: res.cursor || undefined,
        },
      }
    },
  })
}
