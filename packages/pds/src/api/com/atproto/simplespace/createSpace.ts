import { TID } from '@atproto/common'
import { SpaceRef } from '@atproto/syntax'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import type { SimpleSpaceManager } from '../../../../simplespace/manager.js'

export default function (
  server: Server,
  ctx: AppContext,
  manager: SimpleSpaceManager,
) {
  server.add(com.atproto.simplespace.createSpace, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {
        // Performed in the handler as it requires the request body
      },
    }),
    handler: async ({ input: { body }, auth }) => {
      const ownerDid = auth.credentials.did
      const {
        spaceType,
        readPolicy,
        writePolicy,
        appAccess,
        skey = TID.nextStr(),
      } = body

      const ref = new SpaceRef(ownerDid, spaceType, skey)
      const uri = ref.toString()

      auth.credentials.permissions.assertSpaceRef(ref, { manage: 'create' })

      await manager.createSpace(uri, { readPolicy, writePolicy, appAccess })

      return {
        encoding: 'application/json' as const,
        body: { uri },
      }
    },
  })
}
