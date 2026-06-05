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
  server.com.para.community.shareContent({
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
      const communityUri = assertBoardUri(input.body.communityUri)
      const subject = assertStrongRef(input.body.subject)
      const contentType = String(input.body.contentType || '')

      if (!CONTENT_TYPES.has(contentType)) {
        throw new InvalidRequestError('Unsupported shared content type.')
      }

      const now = new Date().toISOString()

      const result = await ctx.actorStore.transact(did, async (actorTxn) => {
        const membership = await getLocalMembership({
          store: actorTxn.record,
          viewerDid: did,
          boardUri: communityUri.toString(),
        })
        if (!isActiveMembership(membership)) {
          throw new InvalidRequestError(
            'Only active community members can share content into this community.',
            'CommunityMembershipRequired',
          )
        }

        const duplicate = await findLocalDuplicateShare({
          store: actorTxn.record,
          communityUri: communityUri.toString(),
          subjectUri: subject.uri,
        })
        if (duplicate) {
          throw new InvalidRequestError(
            'This content is already shared into the community.',
            'DuplicateSharedContent',
          )
        }

        const record = {
          $type: SHARED_CONTENT_COLLECTION,
          subject,
          communityUri: communityUri.toString(),
          contentType,
          sharedBy: did,
          note: input.body.note?.trim() || undefined,
          visibility: input.body.visibility || 'community',
          sourceApp: input.body.sourceApp?.trim() || undefined,
          embedContext: input.body.embedContext,
          pinned: Boolean(input.body.pinned),
          sortRank: input.body.sortRank,
          createdAt: now,
        }

        const write = await prepareCreate({
          did,
          collection: SHARED_CONTENT_COLLECTION,
          rkey: TID.nextStr(),
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
            'failed to update account root after community share',
          )
        })

      return {
        encoding: 'application/json' as const,
        body: {
          uri: result.uri,
          cid: result.cid,
          sharedContent: toSharedContentView(
            result.uri,
            result.cid,
            result.record,
          ),
        },
      }
    },
  })
}

const assertBoardUri = (value: string) => {
  try {
    return assertCommunityBoardUri(value)
  } catch (err) {
    throw new InvalidRequestError(err.message)
  }
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
  return { uri: value.uri, cid: value.cid }
}

const findLocalDuplicateShare = async ({
  store,
  communityUri,
  subjectUri,
}: {
  store: any
  communityUri: string
  subjectUri: string
}) => {
  const recordStore = store.record ?? store
  const records = await recordStore.listRecordsForCollection({
    collection: SHARED_CONTENT_COLLECTION,
    limit: 100,
    reverse: false,
    includeSoftDeleted: true,
  })

  return records.find((record) => {
    const value = record.value as {
      communityUri?: string
      subject?: { uri?: string }
    }
    return (
      value.communityUri === communityUri && value.subject?.uri === subjectUri
    )
  })
}

const toSharedContentView = (uri: string, cid: string, record: any) => ({
  uri,
  cid,
  subject: record.subject,
  communityUri: record.communityUri,
  contentType: record.contentType,
  sharedBy: record.sharedBy,
  note: record.note,
  visibility: record.visibility,
  sourceApp: record.sourceApp,
  embedContext: record.embedContext,
  pinned: record.pinned,
  sortRank: record.sortRank,
  createdAt: record.createdAt,
  removed: false,
  hydrationState: 'unresolved',
})
