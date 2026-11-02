import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../../context.js'
import { com } from '../../../../../lexicons/index.js'
import {
  forwardDataplaneErrors,
  parseDataplaneJson,
} from '../civicTree/util.js'

type ActivityView = com.para.community.listActivities.ActivityView

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.listActivities, {
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
        encoding: 'application/json',
        body: {
          activities: parseDataplaneJson<ActivityView[]>(res.itemsJson, []),
          cursor: res.cursor || undefined,
        },
      }
    },
  })
}
