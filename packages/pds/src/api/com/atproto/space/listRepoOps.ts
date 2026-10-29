import type { l } from '@atproto/lex'
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
  server.add(com.atproto.space.listRepoOps, {
    auth: ctx.authVerifier.spaceAuthorization({
      authorize: () => {
        // Performed in the handler as it requires the `space` param
      },
    }),
    handler: async ({ params, auth, req, res }) => {
      const { space, repo, since, limit, excludeValues } = params

      assertSpaceSelfRead(auth, space, repo)
      const account = await assertRepoAvailability(ctx, repo, true)
      const secret = await getSpaceMacSecret(ctx, {
        req,
        res,
        repo: account.did,
        type: COMMIT_MAC_TYPE,
      })

      const cursor = params.cursor ? parseCursor(params.cursor) : undefined

      await ctx.actorStore.ensureLatestSchema(account.did)
      const { ops, commit } = await ctx.actorStore.read(
        account.did,
        async (store) => {
          const ops = await store.space.listRepoOps(space, {
            since,
            cursor,
            limit,
            excludeValues,
          })

          // A full page means there may be more: the commit comes with the last
          // page. If that page happens to end exactly on the last op, the client
          // just asks once more.
          if (ops.length === limit) return { ops, commit: undefined }

          const commit = buildCommit({
            spaceUri: space,
            repo: account.did,
            state: await store.space.getRepoState(space),
          })
          return { ops, commit }
        },
      )

      const last = ops.at(-1)

      return {
        encoding: 'application/json' as const,
        body: {
          ops: ops.map((op) => ({
            rev: op.rev,
            collection: op.collection as l.NsidString,
            rkey: op.rkey as l.RecordKeyString,
            cid: op.cid as l.CidString | null,
            prev: op.prev as l.CidString | null,
            value: op.value,
          })),
          cursor:
            commit || !last ? undefined : formatCursor(last.rev, last.idx),
          commit: commit,
        },
        headers: commit ? commitMacHeaders(secret, commit) : undefined,
      }
    },
  })
}

const parseCursor = (cursor: string): { rev: string; idx: number } => {
  const [rev, idxStr] = cursor.split('/')
  const idx = parseInt(idxStr, 10)
  if (isNaN(idx)) {
    throw new InvalidRequestError('Malformed cursor', 'MalformedCursor')
  }
  return { rev, idx }
}

const formatCursor = (rev: string, idx: number): string => {
  return `${rev}/${idx}`
}
