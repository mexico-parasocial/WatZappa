import { DAY } from '@atproto/common'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

const MAX_BYTES = 1_000_000
const ACCEPTED = new Set(['image/png', 'image/jpeg'])

/**
 * Stores a banner image in the community's own repo, so it outlives whoever
 * uploaded it. Nobody can sign in as a community, so the caller's own session
 * stands in: they must be one of its owners. The blob stays temporary until a
 * `profile.update` names it.
 *
 * @NOTE Owners on other PDSes cannot upload yet: unlike `act`, this route does
 * not accept a proxied service token.
 */
export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.uploadBanner, {
    auth: ctx.authVerifier.authorization({
      checkTakedown: true,
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'create',
          collection: com.para.community.request.$type,
        })
      },
    }),
    rateLimit: {
      calcKey: ({ auth }) => auth.credentials.did,
      durationMs: DAY,
      points: 50,
    },
    handler: async ({ auth, params, input }) => {
      const owner = auth.credentials.did
      const { community } = params
      const hosted =
        (await ctx.accountManager.getAccount(community)) &&
        (await ctx.actorStore.read(community, (store) =>
          store.community.isCommunity(),
        ))
      if (!hosted) {
        throw new InvalidRequestError(
          'This PDS hosts no such community.',
          'CommunityNotFound',
        )
      }
      const isOwner = await ctx.actorStore.read(community, (store) =>
        store.community.isActiveOwner(owner),
      )
      if (!isOwner) {
        throw new InvalidRequestError(
          'Only an owner can change the banner.',
          'NotPermitted',
        )
      }

      const blob = await ctx.actorStore.writeNoTransaction(
        community,
        async (store) => {
          const metadata = await store.repo.blob.uploadBlobAndGetMetadata(
            input.body,
            input.encoding,
            MAX_BYTES,
          )
          if (!ACCEPTED.has(metadata.mimeType)) {
            throw new InvalidRequestError(
              'A banner is a PNG or JPEG image.',
              'InvalidBanner',
            )
          }
          return store.transact((txn) =>
            txn.repo.blob.trackUntetheredBlob(metadata),
          )
        },
      )

      return {
        encoding: 'application/json' as const,
        body: {
          cid: blob.ref.toString(),
          mimeType: blob.mimeType,
          size: blob.size,
        },
      }
    },
  })
}
