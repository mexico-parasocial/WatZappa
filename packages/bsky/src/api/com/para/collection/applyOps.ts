import { TID } from '@atproto/common'
import { lexParseJsonBytes } from '@atproto/lex'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { Namespaces } from '../../../../stash.js'
import {
  COLLECTION_LIMITS,
  type CollectionOp,
  type CollectionPayload,
  applyCollectionOps,
  validateOpShape,
} from './ops.js'

/** A just-created collection may not be indexed yet; give it a moment. */
const LOOKUP_ATTEMPTS = 4
const LOOKUP_DELAY_MS = 150

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.collection.applyOps, {
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      const actorDid = auth.credentials.iss
      const { id } = input.body
      const ops = input.body.ops as CollectionOp[]

      for (const op of ops) {
        const problem = validateOpShape(op)
        if (problem) throw new InvalidRequestError(problem)
      }

      let row: { payload: Uint8Array } | undefined
      for (let attempt = 0; attempt < LOOKUP_ATTEMPTS && !row; attempt++) {
        if (attempt > 0) await sleep(LOOKUP_DELAY_MS)
        row = (
          await ctx.hydrator.dataplane.getCollectionByKey({ actorDid, key: id })
        ).collection
      }
      if (!row)
        throw new InvalidRequestError('Collection not found', 'NotFound')

      /*
       * Approximate: this is the state as indexed so far, which may lag earlier
       * edits still in the log. It catches an obviously oversized batch early;
       * the subscription enforces the real limits when it applies the edits.
       */
      const current = lexParseJsonBytes(
        row.payload,
      ) as unknown as CollectionPayload
      const { skipped } = applyCollectionOps(current, ops, 'precheck')
      if (skipped.some((s) => s.reason === 'limit')) {
        throw new InvalidRequestError(
          `This would take the collection past its limit (${COLLECTION_LIMITS.items} items, ${COLLECTION_LIMITS.relations} relations).`,
          'LimitExceeded',
        )
      }

      const opId = TID.nextStr()
      await ctx.stashClient.create({
        actorDid,
        namespace: Namespaces.ComParaCollectionDefsCollectionOps,
        payload: {
          collection: id,
          ops,
          createdAt: new Date().toISOString(),
        } as unknown as NonNullable<
          Parameters<typeof ctx.stashClient.create>[0]['payload']
        >,
        key: opId,
      })

      return { encoding: 'application/json', body: { opId } }
    },
  })
}
