// @ts-nocheck
import { CID } from 'multiformats/cid'
import { AtUri } from '@atproto/syntax'
import { ActorStoreReader } from '../../../../actor-store/actor-store-reader.js'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { ids } from '../../../../lexicon/lexicons.js'
import { PostView } from '../../../../lexicon/types/com/para/feed/getAuthorFeed.js'
import { OutputSchema } from '../../../../lexicon/types/com/para/feed/getPostThread.js'
import { Record as ParaPostRecord } from '../../../../lexicon/types/com/para/post.js'
import { com } from '../../../../lexicons/index.js'
import {
  PipethroughUpstreamError,
  computeProxyTo,
} from '../../../../pipethrough.js'
import {
  LocalRecords,
  LocalViewer,
  formatMungedResponse,
  getLocalLag,
  getRepoRev,
  pipethroughReadAfterWrite,
} from '../../../../read-after-write/index.js'
import { RecordDescript } from '../../../../read-after-write/types.js'
import { resolveDidUri, toPostView } from './util.js'

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.com.para.feed.getPostThread({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = ids.ComParaFeedGetPostThread
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      try {
        return await pipethroughReadAfterWrite(
          ctx,
          reqCtx,
          com.para.feed.getPostThread.main,
          getPostThreadMunge,
        )
      } catch (err) {
        const isNotFound =
          err instanceof PipethroughUpstreamError &&
          (err.error === 'NotFound' || err.status === 400 || err.status === 404)
        if (!isNotFound) {
          throw err
        }

        const rev = err.headers && getRepoRev(err.headers)

        const requester = reqCtx.auth.credentials.did
        const resolvedUri = await resolveDidUri(ctx, reqCtx.params.uri)
        if (resolvedUri.hostname !== requester) throw err

        const local = await ctx.actorStore.read(requester, async (store) => {
          if (rev) {
            const records = await store.record.getRecordsSinceRev(rev)
            const fromRev = readAfterWriteNotFound(
              records,
              resolvedUri.toString(),
            )
            if (fromRev) return fromRev
          }
          return readAfterWriteNotFoundNoRev(store, resolvedUri.toString())
        })

        if (!local) throw err
        return formatMungedResponse(local.data, local.lag)
      }
    },
  })
}

const getPostThreadMunge = async (
  _localViewer: LocalViewer,
  original: OutputSchema,
  local: LocalRecords,
): Promise<OutputSchema> => {
  if (local.paraPosts.length === 0) return original

  const byUri = new Map<string, (typeof local.paraPosts)[number]>(
    local.paraPosts.map((post) => [post.uri.toString(), post]),
  )
  const seen = new Set([
    original.post.uri,
    ...original.parents.map((post) => post.uri),
    ...original.replies.map((post) => post.uri),
  ])

  const localAnchor = byUri.get(original.post.uri)
  const post = localAnchor ? toPostView(localAnchor) : original.post

  const parentsToAdd: PostView[] = []
  let nextParent = original.post.replyParent
  while (nextParent && !seen.has(nextParent)) {
    const parent = byUri.get(nextParent)
    if (!parent) break

    const parentView = toPostView(parent)
    parentsToAdd.unshift(parentView)
    seen.add(parentView.uri)
    nextParent = parent.record.reply?.parent.uri
  }

  const rootUri = original.post.replyRoot ?? original.post.uri
  const replies = [...original.replies]
  for (const localPost of local.paraPosts) {
    const uri = localPost.uri.toString()
    if (seen.has(uri) || uri === original.post.uri) continue
    if (localPost.record.reply?.root.uri !== rootUri) continue

    replies.push(toPostView(localPost))
    seen.add(uri)
  }
  replies.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    ...original,
    post,
    parents: [...parentsToAdd, ...original.parents],
    replies,
  }
}

const readAfterWriteNotFound = (
  local: LocalRecords,
  uri: string,
): { data: OutputSchema; lag?: number } | null => {
  const anchor = local.paraPosts.find((post) => post.uri.toString() === uri)
  if (!anchor) return null

  const byUri = new Map<string, (typeof local.paraPosts)[number]>(
    local.paraPosts.map((post) => [post.uri.toString(), post]),
  )
  const post = toPostView(anchor)

  const parents: PostView[] = []
  let nextParent = anchor.record.reply?.parent.uri
  while (nextParent) {
    const parent = byUri.get(nextParent)
    if (!parent) break
    parents.unshift(toPostView(parent))
    nextParent = parent.record.reply?.parent.uri
  }

  const rootUri = post.replyRoot ?? post.uri
  const replies = local.paraPosts
    .filter((post) => post.uri.toString() !== uri)
    .filter((post) => post.record.reply?.root.uri === rootUri)
    .map(toPostView)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    data: {
      post,
      parents,
      replies,
    },
    lag: getLocalLag(local),
  }
}

const readAfterWriteNotFoundNoRev = async (
  store: ActorStoreReader,
  uri: string,
): Promise<{ data: OutputSchema; lag?: number } | null> => {
  const anchorUri = new AtUri(uri)
  const anchor = await store.record.getRecord(anchorUri, null)
  if (!anchor || anchorUri.collection !== ids.ComParaPost) return null

  const anchorDescript: RecordDescript<ParaPostRecord> = {
    uri: anchorUri,
    cid: CID.parse(anchor.cid),
    indexedAt: anchor.indexedAt,
    record: anchor.value as ParaPostRecord,
  }

  const all = await store.record.listRecordsForCollection({
    collection: ids.ComParaPost,
    limit: 1000,
    reverse: false,
  })
  const byUri = new Map<string, (typeof all)[number]>(
    all.map((record) => [record.uri, record]),
  )

  const parentUris: string[] = []
  let nextParent = anchorDescript.record.reply?.parent.uri
  while (nextParent) {
    const parent = byUri.get(nextParent)
    if (!parent) break
    parentUris.unshift(nextParent)
    nextParent = (parent.value as ParaPostRecord).reply?.parent.uri
  }

  const rootUri = anchorDescript.record.reply?.root.uri ?? uri

  const asRecordDescript = (
    record: (typeof all)[number],
  ): RecordDescript<ParaPostRecord> => ({
    uri: new AtUri(record.uri),
    cid: CID.parse(record.cid),
    indexedAt: anchorDescript.indexedAt,
    record: record.value as ParaPostRecord,
  })

  const replies = all
    .filter((record) => record.uri !== uri)
    .filter(
      (record) => (record.value as ParaPostRecord).reply?.root.uri === rootUri,
    )
    .map((record) => toPostView(asRecordDescript(record)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const lag = Date.now() - new Date(anchorDescript.indexedAt).getTime()

  return {
    data: {
      post: toPostView(anchorDescript),
      parents: parentUris
        .map((parentUri) => byUri.get(parentUri))
        .filter((record) => record !== undefined)
        .map((record) => toPostView(asRecordDescript(record))),
      replies,
    },
    lag,
  }
}
