// @ts-nocheck
import { CID } from 'multiformats/cid'
import { TID } from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import {
  PreparedCreate,
  PreparedUpdate,
  prepareCreate,
  prepareUpdate,
} from '../../../../repo/index.js'
import {
  BOARD_COLLECTION,
  LIST_ITEM_COLLECTION,
  MEMBERSHIP_COLLECTION,
  findLocalBoard,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.acceptDraftInvite({
    auth: ctx.authVerifier.authorization({
      authorize: () => {},
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const communityUri = new AtUri(input.body.communityUri)

      if (auth.credentials.type === 'oauth') {
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection: MEMBERSHIP_COLLECTION,
        })
      }

      const boardCreatorDid = communityUri.host

      const { board, starterPackRecord, listItems } = await ctx.actorStore.read(
        boardCreatorDid,
        async (creatorStore) => {
          const board = await findLocalBoard({
            store: creatorStore,
            uri: communityUri.toString(),
          })

          if (!board || (board.record as any).status !== 'draft') {
            return { board, starterPackRecord: null, listItems: [] }
          }

          const spUri = (board.record as any).founderStarterPackUri
          if (!spUri) return { board, starterPackRecord: null, listItems: [] }

          const parsedSp = new AtUri(spUri)
          const starterPackRecord = await creatorStore.record.getRecord(
            parsedSp,
            null,
            true,
          )

          const listItems = await creatorStore.record.listRecordsForCollection({
            collection: LIST_ITEM_COLLECTION,
            limit: 100,
            reverse: false,
          })

          return { board, starterPackRecord, listItems }
        },
      )

      if (!board) {
        throw new InvalidRequestError('Community not found')
      }

      if ((board.record as any).status !== 'draft') {
        throw new InvalidRequestError('Community is no longer in draft mode')
      }

      if (!starterPackRecord)
        throw new InvalidRequestError('Starter pack missing')

      const listUriStr = (starterPackRecord.value as any).list

      const itemsInList = listItems.filter(
        (item) => (item.value as any).list === listUriStr,
      )
      const alreadyMember = itemsInList.some(
        (item) => (item.value as any).subject === did,
      )

      if (alreadyMember) {
        throw new InvalidRequestError('Already accepted')
      }

      const newSize = itemsInList.length + 1

      let updatedCreatorRootCid: CID | undefined
      let updatedCreatorRootRev: string | undefined

      // 1. Transactionally write listitem and update board if needed in the creator's repo.
      await ctx.actorStore.transact(boardCreatorDid, async (creatorTxn) => {
        const listItemRkey = TID.nextStr()
        const listItemRecord = {
          $type: LIST_ITEM_COLLECTION,
          list: listUriStr,
          subject: did,
          createdAt: new Date().toISOString(),
        }

        const listItemWrite = await prepareCreate({
          did: boardCreatorDid,
          collection: LIST_ITEM_COLLECTION,
          rkey: listItemRkey,
          record: listItemRecord,
        })

        const writes: Array<PreparedCreate | PreparedUpdate> = [listItemWrite]

        if (newSize >= 9) {
          const boardWrite = await prepareUpdate({
            did: boardCreatorDid,
            collection: BOARD_COLLECTION,
            rkey: communityUri.rkey,
            record: { ...board.record, status: 'active' },
            swapCid: CID.parse(board.cid),
          })
          writes.push(boardWrite)
        }

        const commit = await creatorTxn.repo.processWrites(writes)
        await ctx.sequencer.sequenceCommit(boardCreatorDid, commit)

        updatedCreatorRootCid = commit.cid
        updatedCreatorRootRev = commit.rev
      })

      let updatedCallerRootCid: CID | undefined
      let updatedCallerRootRev: string | undefined

      // 2. Transactionally write membership in the caller's repo
      await ctx.actorStore.transact(did, async (actorTxn) => {
        const memWrite = await prepareCreate({
          did,
          collection: MEMBERSHIP_COLLECTION,
          rkey: TID.nextStr(),
          record: {
            $type: MEMBERSHIP_COLLECTION,
            community: communityUri.toString(),
            membershipState: 'active',
            roles: ['founder'],
            source: 'acceptDraftInvite',
            joinedAt: new Date().toISOString(),
          },
        })
        const commit = await actorTxn.repo.processWrites([memWrite])
        await ctx.sequencer.sequenceCommit(did, commit)

        updatedCallerRootCid = commit.cid
        updatedCallerRootRev = commit.rev
      })

      if (updatedCreatorRootCid && updatedCreatorRootRev) {
        await ctx.accountManager
          .updateRepoRoot(
            boardCreatorDid,
            updatedCreatorRootCid,
            updatedCreatorRootRev,
          )
          .catch(() => {})
      }

      if (updatedCallerRootCid && updatedCallerRootRev) {
        await ctx.accountManager
          .updateRepoRoot(did, updatedCallerRootCid, updatedCallerRootRev)
          .catch(() => {})
      }

      return {
        encoding: 'application/json' as const,
        body: {
          status: newSize >= 9 ? 'active' : 'draft',
          memberCount: newSize,
        },
      }
    },
  })
}
