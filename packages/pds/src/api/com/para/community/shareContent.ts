import { TID } from '@atproto/common'
import type { LexMap } from '@atproto/lex-data'
import { AtUri, type AtUriString, type DidString } from '@atproto/syntax'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor.js'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { prepareCreate } from '../../../../repo/index.js'
import { commitWrites, stripUndefined, updateRepoRoot } from '../util.js'
import {
  SHARED_CONTENT_COLLECTION,
  assertCommunityBoardUri,
  getLocalMembership,
  isActiveMembership,
} from './util.js'

const CONTENT_TYPES = new Set([
  'post',
  'cabildeo',
  'collection',
  'mapInitiative',
  'external',
])

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.shareContent, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions) => {
        permissions.assertRepo({
          action: 'create',
          collection: SHARED_CONTENT_COLLECTION,
        })
      },
    }),
    handler: async ({ input, auth }) => {
      const did = auth.credentials.did
      const { body } = input
      const communityUri = assertCommunityBoardUri(body.communityUri)
      const subject = assertStrongRef(body.subject)
      const contentType = String(body.contentType || '')

      if (!CONTENT_TYPES.has(contentType)) {
        throw new InvalidRequestError('Unsupported shared content type.')
      }

      const result = await ctx.actorStore.transact(did, async (actorTxn) => {
        const membership = await getLocalMembership({
          store: actorTxn,
          viewerDid: did,
          boardUri: communityUri.toString(),
        })
        if (!isActiveMembership(membership)) {
          throw new InvalidRequestError(
            'Only active community members can share content into this community.',
            'CommunityMembershipRequired',
          )
        }

        if (
          await hasLocalShare(actorTxn, communityUri.toString(), subject.uri)
        ) {
          throw new InvalidRequestError(
            'This content is already shared into the community.',
            'DuplicateSharedContent',
          )
        }

        const record = stripUndefined({
          $type: SHARED_CONTENT_COLLECTION,
          subject,
          communityUri: communityUri.toString(),
          contentType,
          sharedBy: did,
          note: body.note?.trim() || undefined,
          visibility: body.visibility || 'community',
          sourceApp: body.sourceApp?.trim() || undefined,
          embedContext: body.embedContext as LexMap | undefined,
          pinned: Boolean(body.pinned),
          sortRank: body.sortRank,
          createdAt: new Date().toISOString(),
        })

        const write = await prepareCreate({
          did,
          collection: SHARED_CONTENT_COLLECTION,
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

      await updateRepoRoot(ctx, did, result.commit, 'community share')

      return {
        encoding: 'application/json',
        body: {
          uri: result.uri,
          cid: result.cid,
          sharedContent: toSharedContentView(did, result),
        },
      }
    },
  })
}

const assertStrongRef = (value: { uri?: string; cid?: string } | undefined) => {
  if (!value?.uri || !value?.cid) {
    throw new InvalidRequestError('subject must be a strongRef.')
  }
  try {
    new AtUri(value.uri)
  } catch {
    throw new InvalidRequestError('subject.uri must be a valid AT URI.')
  }
  return { uri: value.uri as AtUriString, cid: value.cid }
}

const hasLocalShare = async (
  actorTxn: ActorStoreTransactor,
  communityUri: string,
  subjectUri: string,
) => {
  const records = await actorTxn.record.listRecordsForCollection({
    collection: SHARED_CONTENT_COLLECTION,
    limit: 100,
    reverse: false,
    includeSoftDeleted: true,
  })
  return records.some((record) => {
    const value = record.value as {
      communityUri?: string
      subject?: { uri?: string }
    }
    return (
      value.communityUri === communityUri && value.subject?.uri === subjectUri
    )
  })
}

const toSharedContentView = (
  did: DidString,
  {
    uri,
    cid,
    record,
  }: {
    uri: AtUriString
    cid: string
    record: {
      subject: { uri: AtUriString; cid: string }
      communityUri: string
      contentType: string
      note?: string
      visibility: string
      sourceApp?: string
      embedContext?: LexMap
      pinned: boolean
      sortRank?: number
      createdAt: string
    }
  },
): com.para.community.defs.SharedContentView => ({
  uri,
  cid,
  subject: record.subject,
  communityUri: record.communityUri as AtUriString,
  contentType: record.contentType,
  sharedBy: did,
  note: record.note,
  visibility: record.visibility,
  sourceApp: record.sourceApp,
  embedContext: record.embedContext,
  pinned: record.pinned,
  sortRank: record.sortRank,
  createdAt:
    record.createdAt as com.para.community.defs.SharedContentView['createdAt'],
  removed: false,
  hydrationState: 'unresolved',
})
