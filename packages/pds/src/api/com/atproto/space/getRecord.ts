import { parseCid } from '@atproto/lex-data'
import { RECORD_MAC_TYPE } from '@atproto/space'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { spaceRecordUri } from '../../../../repo/index.js'
import { assertRepoAvailability } from '../sync/util.js'
import {
  assertSpaceSelfRead,
  getSpaceMacSecret,
  recordMacHeaders,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.atproto.space.getRecord, {
    auth: ctx.authVerifier.spaceAuthorization({
      authorize: () => {
        // Performed in the handler as it requires the `space` param
      },
    }),
    handler: async ({ params, auth, req, res }) => {
      const { space, repo, collection, rkey } = params

      assertSpaceSelfRead(auth, space, repo)
      const account = await assertRepoAvailability(ctx, repo, true)
      const secret = await getSpaceMacSecret(ctx, {
        req,
        res,
        repo: account.did,
        type: RECORD_MAC_TYPE,
      })

      const uri = spaceRecordUri(space, account.did, collection, rkey)
      await ctx.actorStore.ensureLatestSchema(account.did)
      const record = await ctx.actorStore.read(account.did, (store) =>
        store.space.getRecord(uri.toString()),
      )
      if (!record) {
        throw new InvalidRequestError(
          `Could not locate record: ${uri}`,
          'RecordNotFound',
        )
      }

      return {
        encoding: 'application/json' as const,
        body: {
          uri: uri.toString(),
          cid: record.cid,
          value: record.value,
        },
        headers: recordMacHeaders(secret, uri.toString(), parseCid(record.cid)),
      }
    },
  })
}
