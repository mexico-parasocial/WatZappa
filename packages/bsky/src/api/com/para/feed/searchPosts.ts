import { Timestamp } from '@bufbuild/protobuf'
import type { AtUriString, DidString } from '@atproto/syntax'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import type { DataPlaneClient } from '../../../../data-plane/index.js'
import type { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import type { Views } from '../../../../views/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.feed.searchPosts, {
    auth: ctx.authVerifier.standardOptional,
    handler: async ({ params, auth, req }) => {
      try {
        const viewer = auth.credentials.iss
        const labelers = ctx.reqLabelers(req)
        const hydrateCtx = await ctx.hydrator.createContext({
          labelers,
          viewer,
        })

        const result = await searchPosts({
          ctx,
          params: { ...params, hydrateCtx },
        })
        const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

        return {
          encoding: 'application/json' as const,
          body: result,
          headers: resHeaders({ labelers: hydrateCtx.labelers, repoRev }),
        }
      } catch (err) {
        console.error('com.para.feed.searchPosts handler error:', err)
        throw err
      }
    },
  })
}

const searchPosts = async (inputs: { ctx: Context; params: Params }) => {
  const { ctx, params } = inputs

  // Combine all PARA-specific filters into the tags array for the data-plane
  const tags = new Set(params.tag || [])
  for (const uri of params.communityUris || []) tags.add(uri)
  for (const uri of params.cabildeoUris || []) tags.add(uri)
  for (const pos of params.politicalCompassPositions || []) tags.add(pos)

  // 1. Search for URIs using the data-plane
  const searchRes = await ctx.dataplane.searchPosts({
    term: params.q,
    limit: params.limit,
    cursor: params.cursor,
    tags: tags.size > 0 ? Array.from(tags) : undefined,
    postType: params.postType,
    flairs: params.flairs,
    party: params.party,
    verifiedPublicFigure: params.verifiedPublicFigure,
    state: params.state,
    districtKey: params.districtKey,
    cabildeoPhase: params.cabildeoPhase,
    authors: params.author ? [params.author] : undefined,
    mentions: params.mentions ? [params.mentions] : undefined,
    domains: params.domain ? [params.domain] : undefined,
    urls: params.url ? [params.url] : undefined,
    since: parseTimestamp(params.since),
    until: parseTimestamp(params.until),
    language: params.lang,
  })

  // 2. Fetch full post objects for the returned URIs
  const postsRes =
    searchRes.uris.length > 0
      ? await ctx.dataplane.getParaPosts({ uris: searchRes.uris })
      : { items: [] }

  // 3. Hydrate author profiles to check for blocks/mutes
  const authors = [
    ...new Set(postsRes.items.map((item) => item.author as DidString)),
  ]
  const hydration = await ctx.hydrator.hydrateProfileViewers(
    authors,
    params.hydrateCtx,
  )

  // 4. Map the response to the lexicon schema
  const posts = postsRes.items
    .filter(
      (item) => !shouldHide(item.author as DidString, ctx.views, hydration),
    )
    .map(
      (item) =>
        ({
          uri: item.uri,
          cid: item.cid,
          author: item.author,
          text: item.text,
          createdAt: item.createdAt,
          replyRoot: parseString(item.replyRoot),
          replyParent: parseString(item.replyParent),
          langs: item.langs.length ? item.langs : undefined,
          tags: item.tags.length ? item.tags : undefined,
          flairs: item.flairs.length ? item.flairs : undefined,
          postType: parseString(item.postType),
        }) as com.para.feed.getAuthorFeed.PostView,
    )

  // The order from getParaPosts might not match the search rank order
  // Sort them to match the original searchRes.uris order
  const orderedPosts: typeof posts = []
  const postByUri = new Map(posts.map((p) => [p.uri, p]))
  for (const uri of searchRes.uris) {
    const post = postByUri.get(uri as AtUriString)
    if (post) {
      orderedPosts.push(post)
    }
  }

  return {
    cursor: parseString(searchRes.cursor),
    posts: orderedPosts,
  }
}

const shouldHide = (
  authorDid: DidString,
  views: Views,
  hydration: Awaited<ReturnType<Hydrator['hydrateProfileViewers']>>,
) => {
  return (
    views.viewerBlockExists(authorDid as DidString, hydration) ||
    views.viewerMuteExists(authorDid as DidString, hydration)
  )
}

const parseTimestamp = (value: string | undefined): Timestamp | undefined => {
  if (!value) return undefined
  const date = new Date(value)
  if (isNaN(date.getTime())) return undefined
  return Timestamp.fromDate(date)
}

type Context = {
  hydrator: Hydrator
  views: Views
  dataplane: DataPlaneClient
}

type Params = com.para.feed.searchPosts.$Params & { hydrateCtx: HydrateCtx }
