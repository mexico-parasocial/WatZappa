import { AtUri } from '@atproto/syntax'
import type { Server } from '@atproto/xrpc-server'
import type { ActorStoreReader } from '../../../../actor-store/actor-store-reader.js'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import {
  PipethroughUpstreamError,
  computeProxyTo,
} from '../../../../pipethrough.js'
import {
  type LocalRecords,
  type MungeFn,
  PARA_POST_COLLECTION,
  type ParaPostRecord,
  formatMungedResponse,
  getLocalLag,
  pipethroughReadAfterWrite,
} from '../../../../read-after-write/index.js'
import {
  type PostView,
  resolveDidUri,
  toPostView,
  toRecordDescript,
} from './util.js'

type OutputBody = com.para.feed.getPostThread.$OutputBody

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.add(com.para.feed.getPostThread, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = com.para.feed.getPostThread.$lxm
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      try {
        return await pipethroughReadAfterWrite(
          ctx,
          reqCtx,
          com.para.feed.getPostThread,
          getPostThreadMunge,
        )
      } catch (err) {
        const isNotFound =
          err instanceof PipethroughUpstreamError &&
          (err.error === 'NotFound' ||
            err.upstream.statusCode === 400 ||
            err.upstream.statusCode === 404)
        if (!isNotFound) throw err

        // The viewer's own post the AppView has not indexed yet.
        const requester = reqCtx.auth.credentials.did
        const resolvedUri = await resolveDidUri(ctx, reqCtx.params.uri)
        if (resolvedUri.hostname !== requester) throw err

        const rev = err.headers?.['atproto-repo-rev']
        const local = await ctx.actorStore.read(requester, async (store) => {
          if (rev) {
            const records = await store.record.getRecordsSinceRev(rev)
            const fromRev = threadFromLocalRecords(
              records,
              resolvedUri.toString(),
            )
            if (fromRev) return fromRev
          }
          return threadFromRepo(store, resolvedUri)
        })

        if (!local) throw err
        return formatMungedResponse(local.data, local.lag)
      }
    },
  })
}

const getPostThreadMunge: MungeFn<OutputBody> = async (
  _localViewer,
  original,
  local,
) => {
  if (local.paraPosts.length === 0) return original

  const byUri = new Map<string, (typeof local.paraPosts)[number]>(
    local.paraPosts.map((post) => [post.uri.toString(), post]),
  )
  const seen = new Set<string>([
    original.post.uri,
    ...original.parents.map((post) => post.uri),
    ...original.replies.map((post) => post.uri),
  ])

  const localAnchor = byUri.get(original.post.uri)
  const post = localAnchor ? toPostView(localAnchor) : original.post

  const parentsToAdd: PostView[] = []
  let nextParent: string | undefined = original.post.replyParent
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
    if (seen.has(uri)) continue
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

type LocalThread = { data: OutputBody; lag?: number }

const threadFromLocalRecords = (
  local: LocalRecords,
  uri: string,
): LocalThread | null => {
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

  return { data: { post, parents, replies }, lag: getLocalLag(local) }
}

/** Without a rev to diff against, builds the thread from the viewer's repo. */
const threadFromRepo = async (
  store: ActorStoreReader,
  anchorUri: AtUri,
): Promise<LocalThread | null> => {
  if (anchorUri.collection !== PARA_POST_COLLECTION) return null
  const anchor = await store.record.getRecord(anchorUri, null)
  if (!anchor) return null

  const uri = anchorUri.toString()
  const anchorDescript = toRecordDescript(anchor, anchor.indexedAt)

  const all = await store.record.listRecordsForCollection({
    collection: PARA_POST_COLLECTION,
    limit: 1000,
    reverse: false,
  })
  const byUri = new Map(all.map((record) => [record.uri as string, record]))
  const valueOf = (record: (typeof all)[number]) =>
    record.value as unknown as ParaPostRecord
  // listRecordsForCollection carries no indexedAt; the anchor's stands in.
  const describe = (record: (typeof all)[number]) =>
    toPostView(toRecordDescript(record, anchor.indexedAt))

  const parents: PostView[] = []
  let nextParent = anchorDescript.record.reply?.parent.uri
  while (nextParent) {
    const parent = byUri.get(nextParent)
    if (!parent) break
    parents.unshift(describe(parent))
    nextParent = valueOf(parent).reply?.parent.uri
  }

  const rootUri = anchorDescript.record.reply?.root.uri ?? uri
  const replies = all
    .filter((record) => record.uri !== uri)
    .filter((record) => valueOf(record).reply?.root.uri === rootUri)
    .map(describe)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    data: { post: toPostView(anchorDescript), parents, replies },
    lag: Date.now() - new Date(anchor.indexedAt).getTime(),
  }
}
