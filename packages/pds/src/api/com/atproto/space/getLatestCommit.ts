import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { assertRepoAvailability } from '../sync/util.js'
import { assertSpaceSelfRead, buildSignedCommit } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.space.getLatestCommit, {
    auth: ctx.authVerifier.spaceAuthorization({
      authorize: () => {
        // Performed in the handler as it requires the `space` param
      },
    }),
    handler: async ({ params, auth }) => {
      const { space, repo } = params

      assertSpaceSelfRead(auth, space, repo)
      const account = await assertRepoAvailability(ctx, repo, true)

      await ctx.actorStore.ensureLatestSchema(account.did)
      const commit = await ctx.actorStore.read(account.did, async (store) =>
        buildSignedCommit({
          spaceUri: space,
          author: account.did,
          state: await store.space.getRepoState(space),
          keypair: await store.keypair(),
        }),
      )

      if (!commit) {
        throw new InvalidRequestError(
          `Could not find repo for space: ${space}`,
          'RepoNotFound',
        )
      }

      return {
        encoding: 'application/json' as const,
        body: {
          commit: com.atproto.space.defs.signedCommit.build(commit),
        },
      }
    },
  })
}
