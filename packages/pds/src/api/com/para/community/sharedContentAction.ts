// @ts-nocheck
import { TID } from '@atproto/common'
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
} from '../../../../repo/index.js'
import {
  SHARED_CONTENT_ACTION_COLLECTION,
  SHARED_CONTENT_COLLECTION,
  assertCommunityBoardUri,
  getLocalMembership,
  isCommunitySteward,
} from './util.js'

export function removeSharedContent(server: Server, ctx: AppContext) {
  registerAction(server, ctx, 'remove')
}

export function restoreSharedContent(server: Server, ctx: AppContext) {
  registerAction(server, ctx, 'restore')
}

const registerAction = (
  server: Server,
  ctx: AppContext,
  action: 'remove' | 'restore',
) => {
  const handler = async ({ input, auth }: any) => {
    const did = auth.credentials.did
    const communityUri = assertBoardUri(input.body.communityUri)
    const sharedContent = assertSharedContentRef(input.body.sharedContent)

    const result = await ctx.actorStore.transact(did, async (actorTxn) => {
      const membership = await getLocalMembership({
        store: actorTxn.record,
        viewerDid: did,
        boardUri: communityUri.toString(),
      })
      if (!isCommunitySteward(membership)) {
        throw new InvalidRequestError(
          'Only community stewards can moderate shared content.',
          'CommunityStewardRequired',
        )
      }

      const now = new Date().toISOString()
      const record = {
        $type: SHARED_CONTENT_ACTION_COLLECTION,
        sharedContent,
        communityUri: communityUri.toString(),
        action,
        note: input.body.note?.trim() || undefined,
        createdAt: now,
      }

      const write = await prepareCreate({
        did,
        collection: SHARED_CONTENT_ACTION_COLLECTION,
        rkey: TID.nextStr(),
        record,
      })

      const commit = await actorTxn.repo.processWrites([write]).catch((err) => {
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
          'failed to update account root after community shared content action',
        )
      })

    return {
      encoding: 'application/json' as const,
      body: {
        uri: result.uri,
        cid: result.cid,
        action: {
          uri: result.uri,
          cid: result.cid,
          sharedContent: result.record.sharedContent,
          communityUri: result.record.communityUri,
          action: result.record.action,
          note: result.record.note,
          createdAt: result.record.createdAt,
          createdBy: did,
        },
      },
    }
  }

  const auth = ctx.authVerifier.authorization({
    authorize: (permissions) => {
      permissions.assertRepo({
        action: 'create',
        collection: SHARED_CONTENT_ACTION_COLLECTION,
      })
    },
  })

  if (action === 'remove') {
    server.com.para.community.removeSharedContent({ auth, handler })
  } else {
    server.com.para.community.restoreSharedContent({ auth, handler })
  }
}

const assertBoardUri = (value: string) => {
  try {
    return assertCommunityBoardUri(value)
  } catch (err) {
    throw new InvalidRequestError(err.message)
  }
}

const assertSharedContentRef = (
  value: { uri?: string; cid?: string } | undefined,
) => {
  if (!value?.uri || !value?.cid) {
    throw new InvalidRequestError('sharedContent must be a strongRef.')
  }
  let uri: AtUri
  try {
    uri = new AtUri(value.uri)
  } catch {
    throw new InvalidRequestError('sharedContent.uri must be a valid AT URI.')
  }
  if (uri.collection !== SHARED_CONTENT_COLLECTION) {
    throw new InvalidRequestError(
      `sharedContent must reference a ${SHARED_CONTENT_COLLECTION} record.`,
    )
  }
  return { uri: value.uri, cid: value.cid }
}
