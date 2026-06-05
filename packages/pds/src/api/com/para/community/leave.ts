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
  prepareUpdate,
} from '../../../../repo/index.js'
import {
  BOARD_COLLECTION,
  MEMBERSHIP_COLLECTION,
  getMembershipUriForBoard,
  getViewerCapabilities,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.leave({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'update',
          collection: MEMBERSHIP_COLLECTION,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const communityUri = assertCommunityBoardUri(input.body.communityUri)
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
          if (!current) {
            throw new InvalidRequestError(
              'No membership exists for this community.',
              'CommunityMembershipNotFound',
            )
          }

          const previous = current.value as {
            membershipState?: string
            roles?: string[]
            source?: string
            joinedAt?: string
          }
          if (previous.roles?.includes('owner')) {
            throw new InvalidRequestError(
              'Community owners cannot leave their own community.',
              'CommunityOwnerCannotLeave',
            )
          }
          if (previous.membershipState === 'blocked') {
            throw new InvalidRequestError(
              'Blocked memberships cannot be changed by the viewer.',
              'CommunityMembershipLocked',
            )
          }

          const record = {
            $type: MEMBERSHIP_COLLECTION,
            community: communityUri.toString(),
            membershipState: 'left',
            roles: previous.roles ?? [],
            source: previous.source ?? 'join',
            joinedAt: previous.joinedAt || now,
            leftAt: now,
          }

          const write = await prepareUpdate({
            did,
            collection: MEMBERSHIP_COLLECTION,
            rkey: membershipUri.rkey,
            record,
            swapCid: CID.parse(current.cid),
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
              'failed to update account root after community leave',
            )
          })

        dbLogger.info(
          {
            did,
            communityUri: communityUri.toString(),
            membershipUri: result.uri,
          },
          'community.leave.success',
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
          'community.leave.failure',
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
