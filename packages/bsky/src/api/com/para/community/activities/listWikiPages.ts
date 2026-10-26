import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../../context.js'
import { com } from '../../../../../lexicons/index.js'
import {
  forwardDataplaneErrors,
  parseDataplaneJson,
} from '../civicTree/util.js'

type WikiPageView = com.para.community.listWikiPages.WikiPageView

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.listWikiPages, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.getParaCommunityWikiPages({
          communityUri: String(params.community ?? ''),
          kind: String(params.kind ?? ''),
        }),
      )
      return {
        encoding: 'application/json',
        body: {
          pages: parseDataplaneJson<WikiPageView[]>(res.itemsJson, []),
        },
      }
    },
  })
}
