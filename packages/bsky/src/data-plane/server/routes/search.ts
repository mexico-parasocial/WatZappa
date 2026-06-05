import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import {
  IndexedAtDidKeyset,
  TimeCidKeyset,
  paginate,
} from '../db/pagination.js'
import { parsePostSearchQuery } from '../util.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => {
  const searchActorsImpl = async (req: {
    term: string
    limit: number
    cursor?: string
  }) => {
    const { term, limit, cursor } = req
    const { ref } = db.db.dynamic
    let builder = db.db
      .selectFrom('actor')
      .where('actor.handle', 'like', `%${cleanQuery(term)}%`)
      .selectAll()

    const keyset = new IndexedAtDidKeyset(
      ref('actor.indexedAt'),
      ref('actor.did'),
    )
    builder = paginate(builder, {
      limit,
      cursor,
      keyset,
      tryIndex: true,
    })

    const res = await builder.execute()

    return {
      dids: res.map((row) => row.did),
      cursor: keyset.packFromResult(res),
    }
  }

  const searchPostsImpl = async (req: {
    term: string
    limit: number
    cursor?: string
    tags?: string[]
  }) => {
    const { term, limit, cursor, tags } = req
    const { q, author } = parsePostSearchQuery(term)

    let authorDid = author
    if (author && !author?.startsWith('did:')) {
      const res = await db.db
        .selectFrom('actor')
        .where('handle', '=', author)
        .selectAll()
        .executeTakeFirst()
      authorDid = res?.did
    }

    const { ref } = db.db.dynamic

    const baseFilters = <T extends 'post' | 'para_post'>(qb: any, table: T) => {
      let qb2 = qb
      if (q) {
        qb2 = qb2.where(`${table}.text`, 'like', `%${q}%`)
      }
      if (authorDid) {
        qb2 = qb2.where(`${table}.creator`, '=', authorDid)
      }
      return qb2
    }

    let postBuilder = baseFilters(db.db.selectFrom('post'), 'post')
    if (tags && tags.length > 0) {
      postBuilder = postBuilder.where((qb) =>
        qb
          .where(sql<boolean>`"post"."tags" ?& ${JSON.stringify(tags)}`)
          .orWhere('post.replyRoot', 'in', tags),
      )
    }

    let paraPostBuilder = baseFilters(
      db.db.selectFrom('para_post'),
      'para_post',
    )
    if (tags && tags.length > 0) {
      paraPostBuilder = paraPostBuilder.where((qb) =>
        qb
          .where(sql<boolean>`"para_post"."tags" ?& ${JSON.stringify(tags)}`)
          .orWhere('para_post.party', 'in', tags)
          .orWhere('para_post.community', 'in', tags)
          .orWhere('para_post.replyRoot', 'in', tags),
      )
    }

    const combinedPosts = postBuilder
      .select(['uri', 'cid', 'sortAt'])
      .unionAll(paraPostBuilder.select(['uri', 'cid', 'sortAt']))

    let builder = db.db
      .selectFrom(combinedPosts.as('combined_posts'))
      .selectAll()

    const keyset = new TimeCidKeyset(
      ref('combined_posts.sortAt'),
      ref('combined_posts.cid'),
    )
    builder = paginate(builder, {
      limit,
      cursor,
      keyset,
      tryIndex: true,
    })

    const res = (await builder.execute()) as {
      uri: string
      sortAt: string
      cid: string
    }[]
    return {
      uris: res.map((row) => row.uri),
      cursor: keyset.packFromResult(res),
    }
  }

  const searchStarterPacksImpl = async (req: {
    term: string
    limit: number
    cursor?: string
  }) => {
    const { term, limit, cursor } = req
    const { ref } = db.db.dynamic
    let builder = db.db
      .selectFrom('starter_pack')
      .where('starter_pack.name', 'ilike', `%${term}%`)
      .selectAll()

    const keyset = new TimeCidKeyset(
      ref('starter_pack.sortAt'),
      ref('starter_pack.cid'),
    )

    builder = paginate(builder, {
      limit,
      cursor,
      keyset,
      tryIndex: true,
    })

    const res = await builder.execute()

    return {
      uris: res.map((row) => row.uri),
      cursor: keyset.packFromResult(res),
    }
  }

  return {
    // @TODO actor search endpoints still fall back to search service
    searchActors: searchActorsImpl,

    // @TODO post search endpoint still falls back to search service
    searchPosts: searchPostsImpl,

    searchStarterPacks: searchStarterPacksImpl,

    // V2 endpoints reuse the V1 SQL for dev env and reshape the response.
    async searchActorsV2(req) {
      const { dids, cursor } = await searchActorsImpl({
        term: req.params?.query ?? '',
        limit: req.params?.limit ?? 25,
        cursor: req.params?.cursor,
      })
      return {
        actors: dids.map((did) => ({ did, score: 0 })),
        pageInfo: { cursor: cursor ?? '', hitsTotal: 0n },
      }
    },

    async searchActorsTypeahead(req) {
      const { dids } = await searchActorsImpl({
        term: req.query,
        limit: req.limit || 10,
      })
      return {
        actors: dids.map((did) => ({ did, score: 0 })),
      }
    },

    async searchPostsV2(req) {
      const author = req.filters?.authors?.[0]
      const baseQuery = req.params?.query ?? ''
      const term = author ? `${baseQuery} from:${author}` : baseQuery
      const { uris, cursor } = await searchPostsImpl({
        term,
        limit: req.params?.limit ?? 25,
        cursor: req.params?.cursor,
      })
      return {
        posts: uris.map((uri) => ({ uri, score: 0 })),
        pageInfo: { cursor: cursor ?? '', hitsTotal: 0n },
      }
    },

    async searchStarterPacksV2(req) {
      const { uris, cursor } = await searchStarterPacksImpl({
        term: req.params?.query ?? '',
        limit: req.params?.limit ?? 25,
        cursor: req.params?.cursor,
      })
      return {
        starterPacks: uris.map((uri) => ({ uri, score: 0 })),
        pageInfo: { cursor: cursor ?? '', hitsTotal: 0n },
      }
    },
  }
}

// Remove leading @ in case a handle is input that way
const cleanQuery = (query: string) => query.trim().replace(/^@/g, '')
