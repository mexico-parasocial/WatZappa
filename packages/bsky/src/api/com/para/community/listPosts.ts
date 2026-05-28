// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/community/listPosts.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listPosts({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const result = await listPosts({ ctx, params })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const listPosts = async ({
  ctx,
  params,
}: {
  ctx: AppContext
  params: QueryParams
}) => {
  const cache = ctx.paraCache
  const cacheKey = cache?.communityFeedKey({
    community: params.community,
    limit: params.limit ?? 50,
    cursor: params.cursor ?? '',
    postType: params.postType ?? '',
  })
  if (cache && cacheKey && process.env.NODE_ENV !== 'development') {
    const cached = await cache.get(cacheKey, 'authorFeed')
    if (cached) return cached
  }

  const res = await ctx.dataplane.getParaCommunityPosts({
    community: params.community,
    limit: params.limit,
    cursor: params.cursor,
    postType: params.postType,
  })

  const result = {
    feed: res.items.map((item) => ({
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
    })),
    cursor: parseString(res.cursor),
  }

  if (cache && cacheKey && process.env.NODE_ENV !== 'development') {
    await cache.set(cacheKey, 'authorFeed', result)
  }
  return result
}
