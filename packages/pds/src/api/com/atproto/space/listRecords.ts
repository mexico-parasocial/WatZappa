import type { NsidString } from '@atproto/syntax'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { assertRepoAvailability } from '../sync/util.js'
import { assertSpaceSelfRead } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.space.listRecords, {
    auth: ctx.authVerifier.spaceAuthorization({
      authorize: () => {
        // Performed in the handler as it requires the `space` param
      },
    }),
    handler: async ({ params, auth }) => {
      const { space, repo, collection, limit, cursor, reverse, excludeValues } =
        params

      assertSpaceSelfRead(auth, space, repo)
      const account = await assertRepoAvailability(ctx, repo, true)

      await ctx.actorStore.ensureLatestSchema(account.did)
      const records = await ctx.actorStore.read(account.did, (store) =>
        store.space.listRecords(space, {
          limit,
          cursor,
          reverse,
          collection,
          excludeValues,
        }),
      )

      return {
        encoding: 'application/json' as const,
        body: {
          cursor: records.length < limit ? undefined : records.at(-1)?.uri,
          records: records.map((record) => ({
            collection: record.collection as NsidString,
            rkey: record.rkey,
            cid: record.cid,
            value: record.value,
          })),
        },
      }
    },
  })
}
