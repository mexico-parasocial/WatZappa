import { parseCid } from '@atproto/lex-data'
import type { AtUriString } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { dbLogger } from '../../../../logger.js'
import { prepareCreate, prepareUpdate } from '../../../../repo/index.js'
import { commitWrites, stripUndefined, updateRepoRoot } from '../util.js'
import {
  MEMBERSHIP_COLLECTION,
  type MembershipRecord,
  assertCommunityBoardUri,
  getMembershipUriForBoard,
  getViewerCapabilities,
} from './util.js'

export function join(server: Server, ctx: AppContext) {
  server.add(com.para.community.join, {
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
      const communityUri = assertCommunityBoardUri(input.body.communityUri)
      const source = input.body.source?.trim() || 'join'
      return writeMembership(ctx, auth.credentials.did, communityUri, 'join', {
        next: (previous, now) => {
          if (
            previous?.membershipState === 'blocked' ||
            previous?.membershipState === 'removed'
          ) {
            throw new InvalidRequestError(
              'This membership cannot be reactivated by the viewer.',
              'CommunityMembershipLocked',
            )
          }
          return {
            community: communityUri.toString(),
            membershipState: 'active',
            roles: previous?.roles ?? [],
            source,
            joinedAt: previous?.joinedAt || now,
          }
        },
      })
    },
  })
}

export function leave(server: Server, ctx: AppContext) {
  server.add(com.para.community.leave, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'update',
          collection: MEMBERSHIP_COLLECTION,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      const communityUri = assertCommunityBoardUri(input.body.communityUri)
      return writeMembership(ctx, auth.credentials.did, communityUri, 'leave', {
        next: (previous, now) => {
          if (!previous) {
            throw new InvalidRequestError(
              'No membership exists for this community.',
              'CommunityMembershipNotFound',
            )
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
          return {
            community: communityUri.toString(),
            membershipState: 'left',
            roles: previous.roles ?? [],
            source: previous.source ?? 'join',
            joinedAt: previous.joinedAt || now,
            leftAt: now,
          }
        },
      })
    },
  })
}

/**
 * Replaces the viewer's membership record for a board (keyed by the board's
 * rkey) with the one `next` derives from the current record.
 */
const writeMembership = async (
  ctx: AppContext,
  did: Parameters<typeof commitWrites>[2],
  communityUri: ReturnType<typeof assertCommunityBoardUri>,
  method: 'join' | 'leave',
  {
    next,
  }: {
    next: (
      previous: Partial<MembershipRecord> | undefined,
      now: string,
    ) => Omit<MembershipRecord, '$type'>
  },
) => {
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
      const fields = next(
        current?.value as Partial<MembershipRecord> | undefined,
        now,
      )
      const record = { $type: MEMBERSHIP_COLLECTION, ...fields }
      const writeOpts = {
        did,
        collection: MEMBERSHIP_COLLECTION,
        rkey: membershipUri.rkey,
        record: stripUndefined(record),
      } as const

      const write = current
        ? await prepareUpdate({ ...writeOpts, swapCid: parseCid(current.cid) })
        : await prepareCreate(writeOpts)

      const commit = await commitWrites(ctx, actorTxn, did, [write])
      return {
        commit,
        uri: write.uri.toString() as AtUriString,
        cid: write.cid.toString(),
        record,
      }
    })

    await updateRepoRoot(ctx, did, result.commit, `community ${method}`)

    dbLogger.info(
      {
        did,
        communityUri: communityUri.toString(),
        membershipUri: result.uri,
      },
      `community.${method}.success`,
    )

    return {
      encoding: 'application/json' as const,
      body: {
        uri: result.uri,
        cid: result.cid,
        communityUri: communityUri.toString() as AtUriString,
        membershipState: result.record.membershipState,
        viewerCapabilities: getViewerCapabilities(result.record),
      },
    }
  } catch (err) {
    dbLogger.error(
      { err, did, communityUri: communityUri.toString() },
      `community.${method}.failure`,
    )
    throw err
  }
}
