import { TID } from '@atproto/common'
import type { LexiconDoc } from '@atproto/lexicon'
import { lexParseJsonBytes } from '@atproto/lex'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Namespaces } from '../../../../stash.js'
import {
  COLLECTION_LIMITS,
  type CollectionOp,
  type CollectionPayload,
  applyCollectionOps,
  validateOpShape,
} from './ops.js'

/*
 * The schema below mirrors lexicons/com/para/collection/applyOps.json. The
 * generated registry (src/lexicon) predates it and cannot be regenerated, so the
 * procedure is installed alongside it, as the civicTree procedures are. The op
 * types are declared locally because `com.para.collection.defs` is already
 * installed from the registry and cannot be redefined.
 */
export const applyOpsSchema: LexiconDoc = {
  lexicon: 1,
  id: 'com.para.collection.applyOps',
  defs: {
    main: {
      type: 'procedure',
      description:
        'Apply edits to a collection, in order, to its current state. Edits from different devices merge instead of overwriting. Applied asynchronously: the response confirms acceptance, not that the edits are readable yet.',
      input: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['id', 'ops'],
          properties: {
            id: { type: 'string', maxLength: 200 },
            ops: {
              type: 'array',
              minLength: 1,
              maxLength: 50,
              items: { type: 'ref', ref: '#collectionOp' },
            },
          },
        },
      },
      output: {
        encoding: 'application/json',
        schema: {
          type: 'object',
          required: ['opId'],
          properties: { opId: { type: 'string' } },
        },
      },
      errors: [{ name: 'NotFound' }, { name: 'LimitExceeded' }],
    },
    collectionOp: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', maxLength: 32 },
        item: { type: 'ref', ref: 'com.para.collection.defs#civicTreeItem' },
        itemKey: { type: 'string', maxLength: 200 },
        patch: { type: 'ref', ref: '#itemPatch' },
        relation: {
          type: 'ref',
          ref: 'com.para.collection.defs#civicTreeRelation',
        },
        relationId: { type: 'string', maxLength: 200 },
        fields: { type: 'ref', ref: '#detailsPatch' },
      },
    },
    itemPatch: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        title: { type: 'string', maxLength: 500 },
        description: { type: 'string', maxLength: 2000 },
        url: { type: 'string', maxLength: 2000 },
        sourceUri: { type: 'string' },
        sourceLabel: { type: 'string', maxLength: 500 },
        policyUri: { type: 'string' },
        policyCid: { type: 'string' },
        policyTitle: { type: 'string', maxLength: 500 },
        policyCategory: { type: 'string', maxLength: 200 },
        policyColor: { type: 'string', maxLength: 7 },
        note: { type: 'string', maxLength: 1000 },
        flairId: { type: 'string' },
      },
    },
    detailsPatch: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 200 },
        description: { type: 'string', maxLength: 2000 },
        color: { type: 'string', maxLength: 7 },
      },
    },
  },
}

/** A just-created collection may not be indexed yet; give it a moment. */
const LOOKUP_ATTEMPTS = 4
const LOOKUP_DELAY_MS = 150

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function (server: any, ctx: AppContext) {
  server.xrpc.method('com.para.collection.applyOps', {
    auth: ctx.authVerifier.standard,
    handler: async ({
      input,
      auth,
    }: {
      input: { body: { id: string; ops: CollectionOp[] } }
      auth: { credentials: { iss: string } }
    }) => {
      const actorDid = auth.credentials.iss
      const { id, ops } = input.body

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
      if (!row) throw new InvalidRequestError('Collection not found', 'NotFound')

      /*
       * Approximate: this is the state as indexed so far, which may lag earlier
       * edits still in the log. It catches an obviously oversized batch early;
       * the subscription enforces the real limits when it applies the edits.
       */
      const current = lexParseJsonBytes(row.payload) as unknown as CollectionPayload
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
