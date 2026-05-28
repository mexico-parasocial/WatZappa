// @ts-nocheck
import { CID } from 'multiformats/cid'
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { dbLogger } from '../../../../logger.js'
import {
  BadCommitSwapError,
  BadRecordSwapError,
  InvalidRecordError,
  prepareCreate,
  prepareUpdate,
} from '../../../../repo/index.js'
import {
  BOARD_COLLECTION,
  MEMBERSHIP_COLLECTION,
  getMembershipUriForBoard,
  getViewerCapabilities,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.join({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'create',
          collection: MEMBERSHIP_COLLECTION,
        })
        permissions.assertRepo({
          action: 'update',
          collection: MEMBERSHIP_COLLECTION,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const communityUri = assertCommunityBoardUri(input.body.communityUri)
      const source = input.body.source?.trim() || 'join'
      const now = new Date().toISOString()

      try {
        const result = await ctx.actorStore.transact(did, async (actorTxn) => {
          const membershipUri = getMembershipUriForBoard({
            viewerDid: did,
            boardUri: communityUri.toString(),
          })
          const current = await actorTxn.record.getRecord(
            membershipUri,
            null,
            true,
          )
          const previous = current?.value as
            | { membershipState?: string; roles?: string[]; joinedAt?: string }
            | undefined

          if (
            previous?.membershipState === 'blocked' ||
            previous?.membershipState === 'removed'
          ) {
            throw new InvalidRequestError(
              'This membership cannot be reactivated by the viewer.',
              'CommunityMembershipLocked',
            )
          }

          const record = {
            $type: MEMBERSHIP_COLLECTION,
            community: communityUri.toString(),
            membershipState: 'active',
            roles: previous?.roles ?? [],
            source,
            joinedAt: previous?.joinedAt || now,
          }

          const write = current
            ? await prepareUpdate({
                did,
                collection: MEMBERSHIP_COLLECTION,
                rkey: membershipUri.rkey,
                record,
                swapCid: CID.parse(current.cid),
              })
            : await prepareCreate({
                did,
                collection: MEMBERSHIP_COLLECTION,
                rkey: membershipUri.rkey,
                record,
              })

          const commit = await actorTxn.repo
            .processWrites([write])
            .catch((err) => {
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
            uri: write.uri.toString(),
            cid: write.cid.toString(),
            record,
          }
        })

        await ctx.accountManager
          .updateRepoRoot(did, result.commit.cid, result.commit.rev)
          .catch((err) => {
            dbLogger.error(
              { err, did, cid: result.commit.cid, rev: result.commit.rev },
              'failed to update account root after community join',
            )
          })

        dbLogger.info(
          {
            did,
            communityUri: communityUri.toString(),
            membershipUri: result.uri,
          },
          'community.join.success',
        )

        return {
          encoding: 'application/json' as const,
          body: {
            uri: result.uri,
            cid: result.cid,
            communityUri: communityUri.toString(),
            membershipState: result.record.membershipState,
            viewerCapabilities: getViewerCapabilities(result.record),
          },
        }
      } catch (err) {
        dbLogger.error(
          { err, did, communityUri: communityUri.toString() },
          'community.join.failure',
        )
        throw err
      }
    },
  })
}

const assertCommunityBoardUri = (value: string) => {
  let uri: AtUri
  try {
    uri = new AtUri(value)
  } catch {
    throw new InvalidRequestError('communityUri must be a valid AT URI.')
  }

  if (uri.collection !== BOARD_COLLECTION || !uri.rkey) {
    throw new InvalidRequestError(
      `communityUri must reference a ${BOARD_COLLECTION} record.`,
    )
  }

  return uri
}
