import { TID } from '@atproto/common'
import type { LexMap } from '@atproto/lex-data'
import { parseCid } from '@atproto/lex-data'
import {
  AtUri,
  type AtUriString,
  type DidString,
  type NsidString,
} from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor.js'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { dbLogger } from '../../../../logger.js'
import {
  type PreparedCreate,
  type PreparedUpdate,
  prepareCreate,
  prepareUpdate,
} from '../../../../repo/index.js'
import { commitWrites, updateRepoRoot } from '../util.js'
import { assertCommunityNameAvailable } from './name-uniqueness.js'
import {
  AUTHORITY_EVENT_COLLECTION,
  BOARD_COLLECTION,
  GOVERNANCE_COLLECTION,
  LIST_COLLECTION,
  LIST_ITEM_COLLECTION,
  MEMBERSHIP_COLLECTION,
  STARTERPACK_COLLECTION,
  buildDelegatesChatId,
  buildSeedGovernanceRecord,
  buildSubdelegatesChatId,
  type LocalBoard,
  deriveBoardSlug,
  findMatchingBoardByIdentity,
  normalizeCommunityName,
  normalizeQuadrant,
} from './util.js'

const OWNER_ROLES = ['owner', 'moderator']

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.createBoard, {
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
        const { permissions } = auth.credentials
        for (const collection of [
          BOARD_COLLECTION,
          MEMBERSHIP_COLLECTION,
          GOVERNANCE_COLLECTION,
          AUTHORITY_EVENT_COLLECTION,
          LIST_COLLECTION,
          STARTERPACK_COLLECTION,
          LIST_ITEM_COLLECTION,
        ]) {
          permissions.assertRepo({ action: 'create', collection })
        }
        for (const collection of [
          BOARD_COLLECTION,
          MEMBERSHIP_COLLECTION,
          GOVERNANCE_COLLECTION,
        ]) {
          permissions.assertRepo({ action: 'update', collection })
        }
      }

      const name = normalizeCommunityName(input.body.name)
      const quadrant = normalizeQuadrant(input.body.quadrant)
      const description = input.body.description?.trim() || undefined
      const region = input.body.region?.trim() || undefined
      const founderStarterPackName =
        input.body.founderStarterPackName?.trim() || undefined
      const governanceMode = input.body.governanceMode || undefined
      const admissionMode = input.body.admissionMode || undefined

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

        // Names are unique across communities. Re-submitting the creator's own
        // board (same name and quadrant) is an idempotent replay, not a clash.
        await assertCommunityNameAvailable({
          ctx,
          did,
          name,
          ownBoardUri: existing?.uri,
        })

        const result = await ensureBoardRecords({
          ctx,
          did,
          name,
          quadrant,
          region,
          description,
          founderStarterPackName,
          governanceMode,
          admissionMode,
          existing: existing ?? undefined,
          idempotencyKey,
        })

        return {
          encoding: 'application/json',
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
  region,
  description,
  founderStarterPackName,
  governanceMode,
  admissionMode,
  existing,
  idempotencyKey,
}: {
  ctx: AppContext
  did: DidString
  name: string
  quadrant: string
  region?: string
  description?: string
  founderStarterPackName?: string
  governanceMode?: string
  admissionMode?: string
  existing?: LocalBoard
  idempotencyKey?: string
}): Promise<com.para.community.createBoard.$OutputBody> => {
  const now = existing?.record.createdAt || new Date().toISOString()
  governanceMode ??= existing?.record.governanceMode ?? 'hierarchical'
  admissionMode ??= existing?.record.admissionMode ?? 'open'
  description ??= existing?.record.description
  region ??= existing?.record.region
  const boardRkey = existing ? new AtUri(existing.uri).rkey : TID.nextStr()

  const listRkey = TID.nextStr()
  const starterPackRkey = TID.nextStr()
  const listItemRkey = TID.nextStr()

  const delegatesChatId =
    existing?.record.delegatesChatId || buildDelegatesChatId(boardRkey)
  const subdelegatesChatId =
    existing?.record.subdelegatesChatId || buildSubdelegatesChatId(boardRkey)
  const founderStarterPackUri =
    existing?.record.founderStarterPackUri ||
    AtUri.make(did, STARTERPACK_COLLECTION, starterPackRkey).toString()
  const slug = deriveBoardSlug(name, boardRkey)
  const boardRecordUri = AtUri.make(did, BOARD_COLLECTION, boardRkey).toString()
  const listUri = AtUri.make(did, LIST_COLLECTION, listRkey).toString()

  // @NOTE A replay keeps the stored board's status and any fields this method
  // does not manage (e.g. chamberMode), and leaves an existing membership and
  // governance record untouched, so re-submitting cannot demote an active
  // board or discard governance edits.
  const boardRecord: LexMap = {
    ...existing?.record,
    $type: BOARD_COLLECTION,
    name,
    description,
    quadrant,
    region,
    delegatesChatId,
    subdelegatesChatId,
    status: existing?.record.status ?? 'draft',
    founderStarterPackUri,
    governanceMode,
    admissionMode,
    createdAt: now,
  }

  const starterName = founderStarterPackName || `Founders: ${name}`

  const listRecord: LexMap = {
    $type: LIST_COLLECTION,
    purpose: 'app.bsky.graph.defs#referencelist',
    name: starterName,
    createdAt: now,
  }

  const starterPackRecord: LexMap = {
    $type: STARTERPACK_COLLECTION,
    list: listUri,
    name: starterName,
    createdAt: now,
  }

  const listItemRecord: LexMap = {
    $type: LIST_ITEM_COLLECTION,
    list: listUri,
    subject: did,
    createdAt: now,
  }

  const membershipRecord: LexMap = {
    $type: MEMBERSHIP_COLLECTION,
    community: boardRecordUri,
    membershipState: 'active',
    roles: OWNER_ROLES,
    source: 'createBoard',
    joinedAt: now,
  }

  const governanceRecord = buildSeedGovernanceRecord({
    did,
    name,
    slug,
    createdAt: now,
    governanceMode,
  })

  const membershipAuthorityRkey = boardRkey
  const officeAuthorityRkey = TID.nextStr()
  const membershipAuthorityUri = AtUri.make(
    did,
    AUTHORITY_EVENT_COLLECTION,
    membershipAuthorityRkey,
  ).toString()
  const membershipAuthorityRecord: LexMap = {
    $type: AUTHORITY_EVENT_COLLECTION,
    community: boardRecordUri,
    subject: did,
    action: 'member.activate',
    issuer: did,
    effectiveAt: now,
    version: 1,
    basis: 'foundingTransition',
    createdAt: now,
  }
  const officeAuthorityRecord: LexMap = {
    $type: AUTHORITY_EVENT_COLLECTION,
    community: boardRecordUri,
    subject: did,
    action: governanceMode === 'horizontal' ? 'moderator.grant' : 'owner.grant',
    issuer: did,
    effectiveAt: now,
    expiresAt:
      governanceMode === 'horizontal'
        ? new Date(Date.parse(now) + 90 * 86400000).toISOString()
        : undefined,
    predecessor: membershipAuthorityUri,
    version: 2,
    basis: 'foundingTransition',
    createdAt: now,
  }

  const { commit, boardCid } = await ctx.actorStore.transact(
    did,
    async (actorTxn) => {
      const boardWrite = existing
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

      const writes: Array<PreparedCreate | PreparedUpdate | null> = [
        boardWrite,
        await prepareCreateIfMissing({
          actorTxn,
          did,
          collection: MEMBERSHIP_COLLECTION,
          rkey: boardRkey,
          record: membershipRecord,
        }),
        await prepareCreateIfMissing({
          actorTxn,
          did,
          collection: GOVERNANCE_COLLECTION,
          rkey: slug,
          record: governanceRecord,
        }),
      ]

      // The founding records are only written on first creation.
      if (!existing) {
        writes.push(
          await prepareCreate({
            did,
            collection: AUTHORITY_EVENT_COLLECTION,
            rkey: membershipAuthorityRkey,
            record: membershipAuthorityRecord,
          }),
          await prepareCreate({
            did,
            collection: AUTHORITY_EVENT_COLLECTION,
            rkey: officeAuthorityRkey,
            record: officeAuthorityRecord,
          }),
          await prepareCreate({
            did,
            collection: LIST_COLLECTION,
            rkey: listRkey,
            record: listRecord,
          }),
          await prepareCreate({
            did,
            collection: STARTERPACK_COLLECTION,
            rkey: starterPackRkey,
            record: starterPackRecord,
          }),
          await prepareCreate({
            did,
            collection: LIST_ITEM_COLLECTION,
            rkey: listItemRkey,
            record: listItemRecord,
          }),
        )
      }

      const boardCid = boardWrite
        ? boardWrite.cid
        : parseCid(existing!.cid)

      const pending = writes.filter((w) => w !== null)
      if (pending.length === 0) {
        return { commit: null, boardCid }
      }

      const commit = await commitWrites(ctx, actorTxn, did, pending)
      return { commit, boardCid }
    },
  )

  if (commit) {
    await updateRepoRoot(ctx, did, commit, 'createBoard')
  }

  const replayed = Boolean(existing)
  dbLogger.info(
    {
      did,
      boardUri: boardRecordUri,
      cid: boardCid.toString(),
      delegatesChatId,
      subdelegatesChatId,
      idempotencyKey,
      replayed,
    },
    replayed ? 'createBoard.replay' : 'createBoard.success',
  )

  return {
    uri: boardRecordUri as AtUriString,
    cid: boardCid.toString(),
    delegatesChatId,
    subdelegatesChatId,
    founderStarterPackUri: founderStarterPackUri as AtUriString,
  }
}

type UpsertOpts = {
  actorTxn: ActorStoreTransactor
  did: DidString
  collection: NsidString
  rkey: string
  record: LexMap
}

const prepareCreateIfMissing = async ({
  actorTxn,
  did,
  collection,
  rkey,
  record,
}: UpsertOpts): Promise<PreparedCreate | null> => {
  const uri = AtUri.make(did, collection, rkey)
  const current = await actorTxn.record.getRecord(uri, null, true)
  if (current) return null
  return prepareCreate({ did, collection, rkey, record })
}

/** A create, an update, or `null` when the stored record is already identical. */
const prepareUpsert = async ({
  actorTxn,
  did,
  collection,
  rkey,
  record,
}: UpsertOpts): Promise<PreparedCreate | PreparedUpdate | null> => {
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
    swapCid: parseCid(current.cid),
  })

  return write.cid.toString() === current.cid ? null : write
}
