import { ForbiddenError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { assertOwnSpace } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.space.clearRecords, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {},
    }),
    rateLimit: [
      {
        name: 'repo-write-hour',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 1,
      },
      {
        name: 'repo-write-day',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 1,
      },
    ],
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const { space, repo } = input.body
      if (repo !== did)
        throw new ForbiddenError('repo must match authenticated user')
      assertOwnSpace(space, did)
      await ctx.actorStore.ensureLatestSchema(did)
      await ctx.actorStore.transact(did, async (actorTxn) => {
        const collections = await actorTxn.space.listCollections(space)
        for (const collection of collections) {
          auth.credentials.permissions.assertSpaceRef(space, {
            action: 'delete',
            collection,
          })
        }
        // Empty repos still require a space-scoped grant; no collection exists to check.
        if (!collections.length) {
          auth.credentials.permissions.assertSpaceRef(space, {
            action: 'read_self',
          })
        }
        await actorTxn.space.clearRecords(space)
      })
      return { encoding: 'application/json' as const, body: {} }
    },
  })
}
