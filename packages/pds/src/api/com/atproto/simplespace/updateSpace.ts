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
  server.add(com.atproto.simplespace.updateSpace, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {
        // Performed in the handler as it requires the request body
      },
    }),
    handler: async ({ input, auth }) => {
      const { space, readPolicy, writePolicy, appAccess } = input.body
      assertSpaceOwner(auth, space, { manage: 'update' })
      await manager.updateSpace(space, { readPolicy, writePolicy, appAccess })
    },
  })
}
