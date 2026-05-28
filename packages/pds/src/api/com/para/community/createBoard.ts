// @ts-nocheck
import { CID } from 'multiformats/cid'
import { TID } from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor.js'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { dbLogger } from '../../../../logger.js'
import {
  BadCommitSwapError,
  BadRecordSwapError,
  InvalidRecordError,
  PreparedCreate,
  PreparedUpdate,
  prepareCreate,
  prepareUpdate,
} from '../../../../repo/index.js'
import {
  BOARD_COLLECTION,
  GOVERNANCE_COLLECTION,
  LIST_COLLECTION,
  LIST_ITEM_COLLECTION,
  MEMBERSHIP_COLLECTION,
  STARTERPACK_COLLECTION,
  buildDelegatesChatId,
  buildSeedGovernanceRecord,
  buildSubdelegatesChatId,
  deriveBoardSlug,
  findMatchingBoardByIdentity,
  normalizeCommunityName,
  normalizeQuadrant,
} from './util.js'

const OWNER_ROLES = ['owner', 'moderator']

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.createBoard({
    auth: ctx.authVerifier.authorization({
      authorize: () => {
        // Repo-scope authorization is checked in the handler because this
        // mutation may create or update multiple collections in one commit.
      },
    }),
    handler: async ({ input, auth, req }) => {
      const did = auth.credentials.did
      const idempotencyKey = req.header('x-idempotency-key') || undefined

      if (auth.credentials.type === 'oauth') {
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: BOARD_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: MEMBERSHIP_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: GOVERNANCE_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'update',
          collection: BOARD_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'update',
          collection: MEMBERSHIP_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'update',
          collection: GOVERNANCE_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: LIST_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: STARTERPACK_COLLECTION,
        })
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: LIST_ITEM_COLLECTION,
        })
      }

      const name = normalizeCommunityName(input.body.name)
      const quadrant = normalizeQuadrant(input.body.quadrant)
      const description = input.body.description?.trim() || undefined
      const founderStarterPackName =
        input.body.founderStarterPackName?.trim() || undefined
      const governanceMode = input.body.governanceMode || 'hierarchical'

      if (!name) {
        throw new InvalidRequestError('Community name is required.')
      }
      if (!quadrant) {
        throw new InvalidRequestError('Quadrant is required.')
      }

      try {
        const existing = await ctx.actorStore.read(did, (store) =>
          findMatchingBoardByIdentity({ store, name, quadrant }),
        )

        const result = await ensureBoardRecords({
          ctx,
          did,
          name,
          quadrant,
          description,
          founderStarterPackName,
          governanceMode,
          existingUri: existing?.uri,
          existingCid: existing?.cid,
          existingCreatedAt: existing?.record.createdAt,
          existingDelegatesChatId: existing?.record.delegatesChatId,
          existingSubdelegatesChatId: existing?.record.subdelegatesChatId,
          idempotencyKey,
        })

        return {
          encoding: 'application/json' as const,
          body: result,
        }
      } catch (err) {
        dbLogger.error(
          { err, did, name, quadrant, idempotencyKey },
          'createBoard.failure',
        )
        throw err
      }
    },
  })
}

const ensureBoardRecords = async ({
  ctx,
  did,
  name,
  quadrant,
  description,
  founderStarterPackName,
  governanceMode,
  existingUri,
  existingCid,
  existingCreatedAt,
  existingDelegatesChatId,
  existingSubdelegatesChatId,
  existingFounderStarterPackUri,
  idempotencyKey,
}: {
  ctx: AppContext
  did: string
  name: string
  quadrant: string
  description?: string
  founderStarterPackName?: string
  governanceMode?: string
  existingUri?: string
  existingCid?: string
  existingCreatedAt?: string
  existingDelegatesChatId?: string
  existingSubdelegatesChatId?: string
  existingFounderStarterPackUri?: string
  idempotencyKey?: string
}) => {
  const now = existingCreatedAt || new Date().toISOString()
  const boardUri = existingUri ? new AtUri(existingUri) : undefined
  const boardRkey = boardUri?.rkey || TID.nextStr()

  const listRkey = TID.nextStr()
  const starterPackRkey = TID.nextStr()
  const listItemRkey = TID.nextStr()

  const delegatesChatId =
    existingDelegatesChatId || buildDelegatesChatId(boardRkey)
  const subdelegatesChatId =
    existingSubdelegatesChatId || buildSubdelegatesChatId(boardRkey)
  const founderStarterPackUri =
    existingFounderStarterPackUri ||
    AtUri.make(did, STARTERPACK_COLLECTION, starterPackRkey).toString()
  const slug = deriveBoardSlug(name, boardRkey)

  const boardRecord = {
    $type: BOARD_COLLECTION,
    name,
    description,
    quadrant,
    delegatesChatId,
    subdelegatesChatId,
    status: 'draft',
    founderStarterPackUri,
    governanceMode,
    createdAt: now,
  } as const

  const starterName = founderStarterPackName || `Founders: ${name}`

  const listRecord = {
    $type: LIST_COLLECTION,
    purpose: 'app.bsky.graph.defs#referencelist',
    name: starterName,
    createdAt: now,
  } as const

  const starterPackRecord = {
    $type: STARTERPACK_COLLECTION,
    list: AtUri.make(did, LIST_COLLECTION, listRkey).toString(),
    name: starterName,
    createdAt: now,
  } as const

  const listItemRecord = {
    $type: LIST_ITEM_COLLECTION,
    list: AtUri.make(did, LIST_COLLECTION, listRkey).toString(),
    subject: did,
    createdAt: now,
  } as const

  const membershipRecord = {
    $type: MEMBERSHIP_COLLECTION,
    community: AtUri.make(did, BOARD_COLLECTION, boardRkey).toString(),
    membershipState: 'active',
    roles: OWNER_ROLES,
    source: 'createBoard',
    joinedAt: now,
  } as const

  const governanceRecord = buildSeedGovernanceRecord({
    did,
    name,
    slug,
    createdAt: now,
    governanceMode,
  })

  const { commit, boardWrite, replayed } = await ctx.actorStore.transact(
    did,
    async (actorTxn) => {
      const boardWrite = existingUri
        ? await prepareUpsert({
            actorTxn,
            did,
            collection: BOARD_COLLECTION,
            rkey: boardRkey,
            record: boardRecord,
          })
        : await prepareCreate({
            did,
            collection: BOARD_COLLECTION,
            rkey: boardRkey,
            record: boardRecord,
          })

      const membershipWrite = await prepareUpsert({
        actorTxn,
        did,
        collection: MEMBERSHIP_COLLECTION,
        rkey: boardRkey,
        record: membershipRecord,
      })

      const governanceWrite = await prepareUpsert({
        actorTxn,
        did,
        collection: GOVERNANCE_COLLECTION,
        rkey: slug,
        record: governanceRecord,
      })

      const listWrite = !existingUri
        ? await prepareCreate({
            did,
            collection: LIST_COLLECTION,
            rkey: listRkey,
            record: listRecord,
          })
        : null

      const starterPackWrite = !existingUri
        ? await prepareCreate({
            did,
            collection: STARTERPACK_COLLECTION,
            rkey: starterPackRkey,
            record: starterPackRecord,
          })
        : null

      const listItemWrite = !existingUri
        ? await prepareCreate({
            did,
            collection: LIST_ITEM_COLLECTION,
            rkey: listItemRkey,
            record: listItemRecord,
          })
        : null

      const writes = [
        boardWrite,
        membershipWrite,
        governanceWrite,
        listWrite,
        starterPackWrite,
        listItemWrite,
      ].filter(Boolean) as Array<PreparedCreate | PreparedUpdate>

      if (writes.length === 0) {
        return {
          commit: null,
          boardWrite: {
            uri: AtUri.make(did, BOARD_COLLECTION, boardRkey),
            cid: CID.parse(existingCid as string),
          },
          replayed: true,
        }
      }

      const commit = await actorTxn.repo.processWrites(writes).catch((err) => {
        if (
          err instanceof BadCommitSwapError ||
          err instanceof BadRecordSwapError
        ) {
          throw new InvalidRequestError(err.message, 'InvalidSwap')
        }
        if (err instanceof InvalidRecordError) {
          throw new InvalidRequestError(err.message)
        }
        throw err
      })

      await ctx.sequencer.sequenceCommit(did, commit)

      return {
        commit,
        boardWrite: boardWrite ?? {
          uri: AtUri.make(did, BOARD_COLLECTION, boardRkey),
          cid: CID.parse(existingCid as string),
        },
        replayed: Boolean(existingUri),
      }
    },
  )

  if (commit) {
    await ctx.accountManager
      .updateRepoRoot(did, commit.cid, commit.rev)
      .catch((err) => {
        dbLogger.error(
          { err, did, cid: commit.cid, rev: commit.rev },
          'failed to update account root after createBoard',
        )
      })
  }

  dbLogger.info(
    {
      did,
      boardUri: boardWrite.uri.toString(),
      cid: boardWrite.cid.toString(),
      delegatesChatId,
      subdelegatesChatId,
      idempotencyKey,
      replayed,
    },
    replayed ? 'createBoard.replay' : 'createBoard.success',
  )

  return {
    uri: boardWrite.uri.toString(),
    cid: boardWrite.cid.toString(),
    delegatesChatId,
    subdelegatesChatId,
    founderStarterPackUri,
  }
}

const prepareUpsert = async ({
  actorTxn,
  did,
  collection,
  rkey,
  record,
}: {
  actorTxn: ActorStoreTransactor
  did: string
  collection: string
  rkey: string
  record: Record<string, unknown>
}) => {
  const uri = AtUri.make(did, collection, rkey)
  const current = await actorTxn.record.getRecord(uri, null, true)

  if (!current) {
    return prepareCreate({ did, collection, rkey, record })
  }

  const write = await prepareUpdate({
    did,
    collection,
    rkey,
    record,
    swapCid: CID.parse(current.cid),
  })

  if (write.cid.toString() === current.cid) {
    return null
  }

  return write
}
