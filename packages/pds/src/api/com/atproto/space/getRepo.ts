import { byteIterableToStream } from '@atproto/common'
import { type SerializedRecord, serializeRepo } from '@atproto/space'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import { SpaceReader } from '../../../../actor-store/space/reader.js'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { assertRepoAvailability } from '../sync/util.js'
import { assertSpaceSelfRead, buildSignedCommit } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.space.getRepo, {
    auth: ctx.authVerifier.spaceAuthorization({
      authorize: () => {
        // Performed in the handler as it requires the `space` param
      },
    }),
    handler: async ({ params, auth }) => {
      const { space, repo } = params

      assertSpaceSelfRead(auth, space, repo)
      const account = await assertRepoAvailability(ctx, repo, true)
      const did = account.did

      await ctx.actorStore.ensureLatestSchema(did)
      // Held open for the life of the stream so records page out lazily.
      const actorDb = await ctx.actorStore.openDb(did)
      try {
        const reader = new SpaceReader(actorDb)
        const state = await reader.getRepoState(space)
        const commit = await buildSignedCommit({
          spaceUri: space,
          author: did,
          state,
          keypair: await ctx.actorStore.keypair(did),
        })
        if (!commit) {
          throw new InvalidRequestError(
            `Could not find repo for space: ${space}`,
            'RepoNotFound',
          )
        }

        const starStream = byteIterableToStream(
          serializeRepo(
            { space, author: did, commit },
            readRecords(reader, space),
          ),
        )
        const closeDb = () => actorDb.close()
        starStream.on('error', closeDb)
        starStream.on('close', closeDb)

        return {
          encoding: 'application/octet-stream' as const,
          body: starStream,
        }
      } catch (err) {
        actorDb.close()
        throw err
      }
    },
  })
}

async function* readRecords(
  reader: SpaceReader,
  space: string,
): AsyncGenerator<SerializedRecord> {
  for await (const record of reader.streamRecords(space)) {
    yield {
      collection: record.collection,
      rkey: record.rkey,
      bytes: record.value ?? new Uint8Array(),
    }
  }
}
