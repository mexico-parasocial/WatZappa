import { TID } from '@atproto/common'
import { type LexMap, parseCid } from '@atproto/lex-data'
import { AtUri, type DidString } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import {
  type PreparedCreate,
  type PreparedUpdate,
  prepareCreate,
  prepareUpdate,
} from '../../../../repo/index.js'
import { commitWrites, updateRepoRoot } from '../util.js'
import {
  BOARD_COLLECTION,
  LIST_ITEM_COLLECTION,
  MEMBERSHIP_COLLECTION,
  assertCommunityBoardUri,
  findLocalBoard,
  getMembershipUriForBoard,
} from './util.js'

/** Founders a draft board needs before it becomes active. */
const ACTIVATION_SIZE = 9

/*
 * Joins a draft board's founding list. The board and its founders starter
 * pack live in the creator's repo, so this only works when the creator's
 * account is hosted on this PDS; the founder's list item is written there.
 */
export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.acceptDraftInvite, {
    auth: ctx.authVerifier.authorization({
      authorize: () => {
        // Checked in the handler: the membership is the only write to the
        // caller's own repo.
      },
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const communityUri = assertCommunityBoardUri(input.body.communityUri)

      if (auth.credentials.type === 'oauth') {
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: MEMBERSHIP_COLLECTION,
        })
      }

      const boardCreatorDid = communityUri.host as DidString
      const creatorAccount =
        await ctx.accountManager.getAccount(boardCreatorDid)
      if (!creatorAccount) {
        throw new InvalidRequestError('Community not found')
      }

      const { board, listUri, listItems } = await ctx.actorStore.read(
        boardCreatorDid,
        async (creatorStore) => {
          const board = await findLocalBoard({
            store: creatorStore,
            uri: communityUri.toString(),
          })
          const spUri = board?.record.founderStarterPackUri
          if (!board || board.record.status !== 'draft' || !spUri) {
            return { board, listUri: undefined, listItems: [] }
          }

          const starterPack = await creatorStore.record.getRecord(
            new AtUri(spUri),
            null,
            true,
          )
          const listUri = starterPack?.value.list
          const listItems = await creatorStore.record.listRecordsForCollection(
            {
              collection: LIST_ITEM_COLLECTION,
              limit: 100,
              reverse: false,
            },
          )
          return {
            board,
            listUri: typeof listUri === 'string' ? listUri : undefined,
            listItems,
          }
        },
      )

      if (!board) {
        throw new InvalidRequestError('Community not found')
      }
      if (board.record.status !== 'draft') {
        throw new InvalidRequestError('Community is no longer in draft mode')
      }
      if (!listUri) {
        throw new InvalidRequestError('Starter pack missing')
      }

      const itemsInList = listItems.filter((item) => item.value.list === listUri)
      if (itemsInList.some((item) => item.value.subject === did)) {
        throw new InvalidRequestError('Already accepted')
      }

      const newSize = itemsInList.length + 1
      const now = new Date().toISOString()

      // 1. The founder's list item, and the board's activation once it has
      // enough founders, in the creator's repo.
      const creatorCommit = await ctx.actorStore.transact(
        boardCreatorDid,
        async (creatorTxn) => {
          const writes: Array<PreparedCreate | PreparedUpdate> = [
            await prepareCreate({
              did: boardCreatorDid,
              collection: LIST_ITEM_COLLECTION,
              rkey: TID.nextStr(),
              record: {
                $type: LIST_ITEM_COLLECTION,
                list: listUri,
                subject: did,
                createdAt: now,
              },
            }),
          ]

          if (newSize >= ACTIVATION_SIZE) {
            writes.push(
              await prepareUpdate({
                did: boardCreatorDid,
                collection: BOARD_COLLECTION,
                rkey: communityUri.rkey,
                record: { ...board.record, status: 'active' },
                swapCid: parseCid(board.cid),
              }),
            )
          }

          return commitWrites(ctx, creatorTxn, boardCreatorDid, writes)
        },
      )
      await updateRepoRoot(
        ctx,
        boardCreatorDid,
        creatorCommit,
        'acceptDraftInvite (creator)',
      )

      // 2. The founder's membership in the caller's repo, keyed by the board's
      // rkey like every other membership record.
      const callerCommit = await ctx.actorStore.transact(
        did,
        async (actorTxn) => {
          const membershipUri = getMembershipUriForBoard({
            viewerDid: did,
            boardUri: communityUri.toString(),
          })
          const current = await actorTxn.record.getRecord(
            membershipUri,
            null,
            true,
          )
          const record: LexMap = {
            $type: MEMBERSHIP_COLLECTION,
            community: communityUri.toString(),
            membershipState: 'active',
            roles: ['founder'],
            source: 'acceptDraftInvite',
            joinedAt: now,
          }
          const writeOpts = {
            did,
            collection: MEMBERSHIP_COLLECTION,
            rkey: membershipUri.rkey,
            record,
          } as const
          const write = current
            ? await prepareUpdate({
                ...writeOpts,
                swapCid: parseCid(current.cid),
              })
            : await prepareCreate(writeOpts)
          return commitWrites(ctx, actorTxn, did, [write])
        },
      )
      await updateRepoRoot(ctx, did, callerCommit, 'acceptDraftInvite (caller)')

      return {
        encoding: 'application/json',
        body: {
          status: newSize >= ACTIVATION_SIZE ? 'active' : 'draft',
          memberCount: newSize,
        },
      }
    },
  })
}
