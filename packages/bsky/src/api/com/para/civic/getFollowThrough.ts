import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { Code, isDataplaneError } from '../../../../data-plane/index.js'
import { com } from '../../../../lexicons/index.js'
import {
  forwardDataplaneErrors,
  parseDataplaneJson,
} from '../community/civicTree/util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.civic.getFollowThrough, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params }) => {
      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane
          .getParaFollowThrough({ itemUri: params.uri })
          .catch((err) => {
            if (isDataplaneError(err, Code.NotFound)) {
              throw new InvalidRequestError('Not found', 'NotFound')
            }
            throw err
          }),
      )
      const [item] = parseDataplaneJson<
        com.para.civic.getFollowThrough.$OutputBody['item'][]
      >(res.itemsJson, [])
      if (!item) throw new InvalidRequestError('Not found', 'NotFound')
      return { encoding: 'application/json' as const, body: { item } }
    },
  })
}
