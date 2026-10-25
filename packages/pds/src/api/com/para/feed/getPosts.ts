import { lexParse } from '@atproto/lex-json'
import { isHandleString } from '@atproto/lex'
import { AtUri, type DidString } from '@atproto/syntax'
import type { Server } from '@atproto/xrpc-server'
import type { ActorStoreReader } from '../../../../actor-store/actor-store-reader.js'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { readStickyLogger as log } from '../../../../logger.js'
import {
  asPipeThroughBuffer,
  computeProxyTo,
  isJsonContentType,
} from '../../../../pipethrough.js'
import {
  type LocalRecords,
  PARA_POST_COLLECTION,
  type ParaPostRecord,
  type RecordDescript,
  formatMungedResponse,
  getLocalLag,
  pipethroughReadAfterWrite,
} from '../../../../read-after-write/index.js'
import { toPostView, toRecordDescript } from './util.js'

type OutputBody = com.para.feed.getPosts.$OutputBody

/*
 * Read-after-write for `com.para.post` records hosted on this PDS. Besides the
 * viewer's records newer than the AppView's rev, requested posts the AppView
 * does not return at all are read from the repo of the first requested post's
 * author when that account lives here.
 */
export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.add(com.para.feed.getPosts, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = com.para.feed.getPosts.$lxm
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      const uris: string[] = reqCtx.params.uris

      const pipethroughRes = await pipethroughReadAfterWrite(
        ctx,
        reqCtx,
        com.para.feed.getPosts,
        async (_, original, local) => getPostsMunge(original, local, uris),
      )
      if (!('stream' in pipethroughRes)) {
        return pipethroughRes
      }

      const requester = reqCtx.auth.credentials.did
      const fallbackDid = await resolveFallbackDid(ctx, uris)
      if (!fallbackDid) return pipethroughRes

      const local = await ctx.actorStore.read(fallbackDid, (store) =>
        getRequestedLocalPosts(store, uris),
      )
      if (local.count === 0) return pipethroughRes

      if (
        isJsonContentType(pipethroughRes.headers?.['content-type']) === false
      ) {
        return pipethroughRes
      }

      let bufferRes: Awaited<ReturnType<typeof asPipeThroughBuffer>> | undefined
      try {
        const { buffer } = (bufferRes = await asPipeThroughBuffer(
          pipethroughRes,
          ctx.cfg.proxy.maxResponseSize,
        ))
        const lex = lexParse(buffer.toString('utf8'), { strict: false })
        const parsed = com.para.feed.getPosts.$output.schema.safeValidate(lex, {
          strict: false,
        })
        if (!parsed.success) return bufferRes
        const data = getPostsMunge(parsed.value as OutputBody, local, uris)
        return formatMungedResponse(data, getLocalLag(local))
      } catch (err) {
        log.warn({ err, requester }, 'error in para getPosts read-after-write')
        if (!bufferRes && !pipethroughRes.stream.readable) throw err
        return bufferRes ?? pipethroughRes
      }
    },
  })
}

const getPostsMunge = (
  original: OutputBody,
  local: LocalRecords,
  requestedUris: string[],
): OutputBody => {
  const requested = new Set(requestedUris)
  const postsByUri = new Map<string, OutputBody['posts'][number]>(
    original.posts.map((post) => [post.uri, post]),
  )

  for (const post of local.paraPosts) {
    const uri = post.uri.toString()
    if (!requested.has(uri) || postsByUri.has(uri)) continue
    postsByUri.set(uri, toPostView(post))
  }

  const posts = requestedUris
    .map((uri) => postsByUri.get(uri))
    .filter((post) => post !== undefined)

  return { ...original, posts }
}

const getRequestedLocalPosts = async (
  store: ActorStoreReader,
  requestedUris: string[],
): Promise<LocalRecords> => {
  const paraPosts: RecordDescript<ParaPostRecord>[] = []

  for (const uri of new Set(requestedUris)) {
    const parsed = parseParaPostUri(uri)
    if (!parsed) continue
    const record = await store.record.getRecord(parsed, null)
    if (!record) continue
    paraPosts.push(toRecordDescript(record, record.indexedAt))
  }

  return { count: paraPosts.length, profile: null, posts: [], paraPosts }
}

const resolveFallbackDid = async (
  ctx: AppContext,
  requestedUris: string[],
): Promise<DidString | undefined> => {
  for (const uri of requestedUris) {
    const parsed = parseParaPostUri(uri)
    if (!parsed) continue
    const { hostname } = parsed
    const did = hostname.startsWith('did:')
      ? (hostname as DidString)
      : isHandleString(hostname)
        ? await ctx.accountManager.getDidForActor(hostname)
        : null
    if (did && (await ctx.accountManager.getAccount(did))) return did
  }
  return undefined
}

const parseParaPostUri = (uri: string) => {
  try {
    const parsed = new AtUri(uri)
    return parsed.collection === PARA_POST_COLLECTION ? parsed : null
  } catch {
    return null
  }
}
