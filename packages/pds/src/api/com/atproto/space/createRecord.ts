import { ForbiddenError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { prepareCreate } from '../../../../repo/index.js'
import { asRequestError, assertOwnSpace } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.space.createRecord, {
    auth: ctx.authVerifier.spaceAuthorization({
      checkTakedown: true,
      checkDeactivated: true,
      authorize: () => {
        // Performed in the handler as it requires the request body
      },
    }),
    rateLimit: [
      {
        name: 'repo-write-hour',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 3,
      },
      {
        name: 'repo-write-day',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 3,
      },
    ],
    opts: {
      jsonLimit: 1_000_000,
    },
    handler: async ({ input: { body }, auth }) => {
      const did = auth.credentials.did
      const { space, repo, collection, rkey, record } = body
      if (repo !== did) {
        throw new ForbiddenError('repo must match authenticated user')
      }

      auth.credentials.permissions.assertSpaceRef(space, {
        action: 'create',
        collection,
      })
      assertOwnSpace(space, did)

      const write = await asRequestError(() =>
        prepareCreate({
          did,
          space,
          collection,
          rkey,
          record,
          validate: body.validate,
        }),
      )

      await ctx.actorStore.ensureLatestSchema(did)
      await ctx.actorStore.transact(did, (actorTxn) =>
        actorTxn.space.applyWrites(space, [write]),
      )

      return {
        encoding: 'application/json' as const,
        body: {
          uri: write.uri.toString(),
          cid: write.cid.toString(),
          validationStatus: write.validationStatus,
        },
      }
    },
  })
}
