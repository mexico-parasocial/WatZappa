import { TID } from '@atproto/common'
import { AtUri, type AtUriString } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { prepareCreate } from '../../../../repo/index.js'
import { commitWrites, stripUndefined, updateRepoRoot } from '../util.js'
import {
  SHARED_CONTENT_ACTION_COLLECTION,
  SHARED_CONTENT_COLLECTION,
  assertCommunityBoardUri,
  getLocalMembership,
  isCommunitySteward,
} from './util.js'

export function removeSharedContent(server: Server, ctx: AppContext) {
  server.add(com.para.community.removeSharedContent, {
    auth: actionAuth(ctx),
    handler: ({ input, auth }) =>
      writeAction(ctx, auth.credentials.did, input.body, 'remove'),
  })
}

export function restoreSharedContent(server: Server, ctx: AppContext) {
  server.add(com.para.community.restoreSharedContent, {
    auth: actionAuth(ctx),
    handler: ({ input, auth }) =>
      writeAction(ctx, auth.credentials.did, input.body, 'restore'),
  })
}

const actionAuth = (ctx: AppContext) =>
  ctx.authVerifier.authorization({
    authorize: (permissions) => {
      permissions.assertRepo({
        action: 'create',
        collection: SHARED_CONTENT_ACTION_COLLECTION,
      })
    },
  })

const writeAction = async (
  ctx: AppContext,
  did: Parameters<typeof commitWrites>[2],
  body:
    | com.para.community.removeSharedContent.$InputBody
    | com.para.community.restoreSharedContent.$InputBody,
  action: 'remove' | 'restore',
) => {
  const communityUri = assertCommunityBoardUri(body.communityUri)
  const sharedContent = assertSharedContentRef(body.sharedContent)

  const result = await ctx.actorStore.transact(did, async (actorTxn) => {
    const membership = await getLocalMembership({
      store: actorTxn,
      viewerDid: did,
      boardUri: communityUri.toString(),
    })
    if (!isCommunitySteward(membership)) {
      throw new InvalidRequestError(
        'Only community stewards can moderate shared content.',
        'CommunityStewardRequired',
      )
    }

    const record = stripUndefined({
      $type: SHARED_CONTENT_ACTION_COLLECTION,
      sharedContent,
      communityUri: communityUri.toString() as AtUriString,
      action,
      note: body.note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    })

    const write = await prepareCreate({
      did,
      collection: SHARED_CONTENT_ACTION_COLLECTION,
      rkey: TID.nextStr(),
      record,
    })
    const commit = await commitWrites(ctx, actorTxn, did, [write])
    return {
      commit,
      uri: write.uri.toString() as AtUriString,
      cid: write.cid.toString(),
      record,
    }
  })

  await updateRepoRoot(
    ctx,
    did,
    result.commit,
    'community shared content action',
  )

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
        createdAt: result.record
          .createdAt as com.para.community.defs.SharedContentActionView['createdAt'],
        createdBy: did,
      },
    },
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
  return { uri: value.uri as AtUriString, cid: value.cid }
}
