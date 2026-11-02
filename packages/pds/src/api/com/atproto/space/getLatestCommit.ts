import { COMMIT_MAC_TYPE } from '@atproto/space'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { assertRepoAvailability } from '../sync/util.js'
import {
  assertSpaceSelfRead,
  buildCommit,
  commitMacHeaders,
  getSpaceMacSecret,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.space.getLatestCommit, {
    auth: ctx.authVerifier.spaceAuthorization({
      authorize: () => {
        // Performed in the handler as it requires the `space` param
      },
    }),
    handler: async ({ params, auth, req, res }) => {
      const { space, repo } = params

      assertSpaceSelfRead(auth, space, repo)
      const account = await assertRepoAvailability(ctx, repo, true)
      const secret = await getSpaceMacSecret(ctx, {
        req,
        res,
        repo: account.did,
        type: COMMIT_MAC_TYPE,
      })

      await ctx.actorStore.ensureLatestSchema(account.did)
      const commit = await ctx.actorStore.read(account.did, async (store) =>
        buildCommit({
          spaceUri: space,
          repo: account.did,
          state: await store.space.getRepoState(space),
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
          commit,
        },
        headers: commitMacHeaders(secret, commit),
      }
    },
  })
}
