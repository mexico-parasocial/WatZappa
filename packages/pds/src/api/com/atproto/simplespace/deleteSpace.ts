import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import type { SimpleSpaceManager } from '../../../../simplespace/manager.js'
import { assertSpaceOwner } from '../space/util.js'

export default function (
  server: Server,
  ctx: AppContext,
  manager: SimpleSpaceManager,
) {
  server.add(com.atproto.simplespace.deleteSpace, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {
        // Performed in the handler as it requires the request body
      },
    }),
    handler: async ({ input: { body }, auth }) => {
      const { space } = body
      assertSpaceOwner(auth, space, { manage: 'delete' })
      const result = await manager.deleteSpace(space)
      if (result.status === 'absent') {
        throw new InvalidRequestError('Space not found', 'SpaceNotFound')
      }
      await ctx.spaceDeletionNotifications.enqueue(space, result.recipients)
      ctx.backgroundQueue.add(() =>
        ctx.spaceDeletionNotifications.retryPending(),
      )
    },
  })
}
