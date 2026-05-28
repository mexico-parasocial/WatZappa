// @ts-nocheck
import { CID } from 'multiformats/cid'
import { jsonToLex } from '@atproto/lexicon'
import { AtUri } from '@atproto/syntax'
import { ActorStoreReader } from '../../../../actor-store/actor-store-reader.js'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { ids } from '../../../../lexicon/lexicons.js'
import { OutputSchema } from '../../../../lexicon/types/com/para/feed/getPosts.js'
import { Record as ParaPostRecord } from '../../../../lexicon/types/com/para/post.js'
import { com } from '../../../../lexicons/index.js'
import { readStickyLogger as log } from '../../../../logger.js'
import {
  asPipeThroughBuffer,
  computeProxyTo,
  isJsonContentType,
} from '../../../../pipethrough.js'
import {
  LocalRecords,
  RecordDescript,
  formatMungedResponse,
  getLocalLag,
  pipethroughReadAfterWrite,
} from '../../../../read-after-write/index.js'
import { toPostView } from './util.js'

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.com.para.feed.getPosts({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = ids.ComParaFeedGetPosts
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      const uris = Array.isArray(reqCtx.params.uris)
        ? reqCtx.params.uris
        : [reqCtx.params.uris]

      const pipethroughRes = await pipethroughReadAfterWrite<OutputSchema>(
        ctx,
        reqCtx,
        com.para.feed.getPosts.main,
        (_, original, local) => getPostsMunge(original, local, uris),
      )

      if (!('stream' in pipethroughRes)) {
        return pipethroughRes
      }

      const requester = reqCtx.auth.credentials.did
      const fallbackDid = await resolveFallbackDid(ctx, requester, uris)
      const local = await ctx.actorStore.read(fallbackDid, (store) =>
        getRequestedLocalPosts(store, uris),
      )
      if (local.count === 0) {
        return pipethroughRes
      }

      if (
        isJsonContentType(pipethroughRes.headers?.['content-type']) === false
      ) {
        return pipethroughRes
      }

      let bufferRes: Awaited<ReturnType<typeof asPipeThroughBuffer>> | undefined
      try {
        const { buffer } = (bufferRes =
          await asPipeThroughBuffer(pipethroughRes))
        const lex = jsonToLex(JSON.parse(buffer.toString('utf8')))
        const original = lex as OutputSchema
        const data = await getPostsMunge(original, local, uris)
        return formatMungedResponse(data, getLocalLag(local))
      } catch (err) {
        log.warn({ err, requester }, 'error in para getPosts read-after-write')
        return bufferRes ?? pipethroughRes
      }
    },
  })
}

const getPostsMunge = async (
  original: OutputSchema,
  local: LocalRecords,
  requestedUris: string[],
): Promise<OutputSchema> => {
  const requested = new Set(requestedUris)
  const postsByUri = new Map(original.posts.map((post) => [post.uri, post]))

  for (const post of local.paraPosts) {
    const uri = post.uri.toString()
    if (!requested.has(uri) || postsByUri.has(uri)) continue
    postsByUri.set(uri, toPostView(post))
  }

  const posts = requestedUris
    .map((uri) => postsByUri.get(uri))
    .filter((post) => post !== undefined)

  return {
    ...original,
    posts,
  }
}

const getRequestedLocalPosts = async (
  store: ActorStoreReader,
  requestedUris: string[],
): Promise<LocalRecords> => {
  const seen = new Set<string>()
  const paraPosts: RecordDescript<ParaPostRecord>[] = []

  for (const uri of requestedUris) {
    if (seen.has(uri)) continue
    seen.add(uri)

    let parsed: AtUri
    try {
      parsed = new AtUri(uri)
    } catch {
      continue
    }
    if (parsed.collection !== ids.ComParaPost) {
      continue
    }

    const record = await store.record.getRecord(parsed, null)
    if (!record) continue

    paraPosts.push({
      uri: parsed,
      cid: CID.parse(record.cid),
      indexedAt: record.indexedAt,
      record: record.value as ParaPostRecord,
    })
  }

  return {
    count: paraPosts.length,
    profile: null,
    posts: [],
    paraPosts,
  }
}

const resolveFallbackDid = async (
  ctx: AppContext,
  requester: string,
  requestedUris: string[],
): Promise<string> => {
  for (const uri of requestedUris) {
    let parsed: AtUri
    try {
      parsed = new AtUri(uri)
    } catch {
      continue
    }
    if (parsed.collection !== ids.ComParaPost) continue
    if (parsed.hostname.startsWith('did:')) return parsed.hostname
    const did = await ctx.accountManager.getDidForActor(parsed.hostname)
    if (did) return did
  }
  return requester
}
