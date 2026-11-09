import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import {
  forwardDataplaneErrors,
  parseDataplaneJson,
} from '../community/civicTree/util.js'

/*
 * The conclusion of a forum or persuasion cabildeo. The data plane serves only
 * what a steward of the cabildeo's community wrote; see
 * data-plane/server/routes/conclusion.ts.
 */
export default function (server: Server, ctx: AppContext) {
  server.add(com.para.civic.getConclusion, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.getParaConclusion({ cabildeoUri: params.cabildeo }),
      )
      const conclusion = parseDataplaneJson<
        com.para.civic.getConclusion.$OutputBody['conclusion'] | undefined
      >(res.conclusionJson, undefined)
      return {
        encoding: 'application/json' as const,
        body: {
          conclusion,
          communityUri: (res.communityUri ||
            undefined) as com.para.civic.getConclusion.$OutputBody['communityUri'],
          earlier: parseDataplaneJson<
            com.para.civic.getConclusion.$OutputBody['earlier']
          >(res.earlierJson, []),
        },
      }
    },
  })
}
