import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import type { SimpleSpaceManager } from '../../../../simplespace/manager.js'
import { assertSpaceOwner } from '../space/util.js'

export default function (
  server: Server,
  ctx: AppContext,
  manager: SimpleSpaceManager,
) {
  server.add(com.atproto.simplespace.getSpace, {
    auth: ctx.authVerifier.spaceAuthorization({
      authorize: () => {
        // Performed in the handler as it requires the `space` param
      },
    }),
    handler: async ({ params, auth }) => {
      const { space } = params
      assertSpaceOwner(auth, space, { action: 'read_self' })
      return {
        encoding: 'application/json' as const,
        body: await manager.getSpace(space),
      }
    },
  })
}
