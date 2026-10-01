import assert from 'node:assert'
import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import type { Service } from '../../../proto/bsky_connect.js'
import {
  FeedType,
  ParaAuthorFeedItem,
  ParaOpenQuestionReplyItem,
} from '../../../proto/bsky_pb.js'
import type { Database } from '../db/index.js'
import { TimeCidKeyset, paginate } from '../db/pagination.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaAuthorFeed(req) {
    const { ref } = db.db.dynamic
    let builder = db.db
      .selectFrom('para_post')
      .selectAll('para_post')
      .where('creator', '=', req.actorDid)

    if (req.party) {
      builder = builder.where(paraMetaMatches('party', req.party))
    }
    if (req.community) {
      builder = builder.where(paraMetaMatches('community', req.community))
    }
    if (req.flairTag) {
      builder = builder.where(paraFlairMatches(req.flairTag))
    }
    if (req.postType) {
      builder = builder.where(paraPostTypeMatches(req.postType))
    }

    const keyset = new TimeCidKeyset(
      ref('para_post.sortAt'),
      ref('para_post.cid'),
    )

    builder = paginate(builder, {
      limit: req.limit,
      cursor: req.cursor,
      keyset,
      tryIndex: true,
    })

    const posts = await builder.execute()

    return {
      items: posts.map(paraFeedItemFromRow),
      cursor: keyset.packFromResult(posts),
    }
  },

  async getParaMemes(req) {
    const { limit, cursor } = req
    const { ref } = db.db.dynamic

    const keyset = new TimeCidKeyset(
      ref('para_post.sortAt'),
      ref('para_post.cid'),
    )

    let builder = db.db
      .selectFrom('para_post')
      .selectAll('para_post')
      .where(paraPostTypeMatches('meme'))

    if (req.party) {
      builder = builder.where(paraMetaMatches('party', req.party))
    }
    if (req.community) {
      builder = builder.where(paraMetaMatches('community', req.community))
    }
    if (req.state) {
      builder = builder.where(
        sql<boolean>`lower(coalesce("para_post"."state", '')) = ${req.state.trim().toLowerCase()}`,
      )
    }
    if (req.category) {
      builder = builder.where(
        sql<boolean>`lower(coalesce("para_post"."category", '')) = ${req.category.trim().toLowerCase()}`,
      )
    }
    if (req.flairTag) {
      builder = builder.where(paraFlairMatches(req.flairTag))
    }

    builder = paginate(builder, {
      limit,
      cursor,
      keyset,
      tryIndex: true,
    })

    const posts = await builder.execute()

    return {
      items: posts.map(paraFeedItemFromRow),
      cursor: keyset.packFromResult(posts),
    }
  },

  async getParaTimeline(req) {
    const { actorDid, limit, cursor } = req
    const { ref } = db.db.dynamic

    const keyset = new TimeCidKeyset(
      ref('para_post.sortAt'),
      ref('para_post.cid'),
    )

    let followQb = db.db
      .selectFrom('para_post')
      .innerJoin('follow', 'follow.subjectDid', 'para_post.creator')
      .where('follow.creator', '=', actorDid)
      .selectAll('para_post')

    if (req.party) {
      followQb = followQb.where(paraMetaMatches('party', req.party))
    }
    if (req.community) {
      followQb = followQb.where(paraMetaMatches('community', req.community))
    }
    if (req.flairTag) {
      followQb = followQb.where(paraFlairMatches(req.flairTag))
    }
    if (req.postType) {
      followQb = followQb.where(paraPostTypeMatches(req.postType))
    }

    followQb = paginate(followQb, {
      limit,
      cursor,
      keyset,
      tryIndex: true,
    })

    let selfQb = db.db
      .selectFrom('para_post')
      .where('para_post.creator', '=', actorDid)
      .selectAll('para_post')

    if (req.party) {
      selfQb = selfQb.where(paraMetaMatches('party', req.party))
    }
    if (req.community) {
      selfQb = selfQb.where(paraMetaMatches('community', req.community))
    }
    if (req.flairTag) {
      selfQb = selfQb.where(paraFlairMatches(req.flairTag))
    }
    if (req.postType) {
      selfQb = selfQb.where(paraPostTypeMatches(req.postType))
    }

    selfQb = paginate(selfQb, {
      limit,
      cursor,
      keyset,
      tryIndex: true,
    })

    const [followRes, selfRes] = await Promise.all([
      followQb.execute(),
      selfQb.execute(),
    ])

    // Use own posts to fill space left by followed-account posts. When followed-account
    // posts already fill the page, still allow up to 10 own posts into the merged results.
    const selfLimit = Math.max(
      // Allow up to 10 own posts even when followed-account posts can fill the page.
      Math.min(limit, 10),
      // Allow enough own posts to fill the slots not occupied by followed-account posts.
      limit - Math.min(followRes.length, limit),
    )
    // The extra own post proves that another page exists, but is not part of this page.
    const selfHasMore = selfRes.length > selfLimit
    const selfItems = selfRes.slice(0, selfLimit)
    const feedItems = [...followRes, ...selfItems].sort((a, b) => {
      if (a.sortAt > b.sortAt) return -1
      if (a.sortAt < b.sortAt) return 1
      return a.cid > b.cid ? -1 : 1
    })

    const page = keyset.page(feedItems, limit)
    if (page.items.length === 0) {
      return { items: [], cursor: undefined }
    }
    const items = page.items.map(paraFeedItemFromRow)
    if (page.cursor) {
      return { items, cursor: page.cursor }
    }
    // Own posts exceeded their separate cap, but the combined results did not exceed the requested limit.
    if (selfHasMore) {
      const lastItem = page.items.at(-1)
      assert(lastItem)
      return { items, cursor: keyset.packFromResult(lastItem) }
    }
    return { items, cursor: undefined }
  },

  async getParaPosts(req) {
    if (!req.uris.length) {
      return { items: [] }
    }

    const posts = await db.db
      .selectFrom('para_post')
      .selectAll('para_post')
      .where('uri', 'in', req.uris)
      .execute()

    const byUri = new Map(posts.map((post) => [post.uri, post]))

    return {
      items: req.uris
        .map((uri) => byUri.get(uri))
        .filter((post): post is NonNullable<typeof post> => !!post)
        .map(paraFeedItemFromRow),
    }
  },

  async getParaThread(req) {
    const post = await db.db
      .selectFrom('para_post')
      .selectAll('para_post')
      .where('uri', '=', req.postUri)
      .executeTakeFirst()

    if (!post) {
      return {}
    }

    const [parents, replies] = await Promise.all([
      post.replyRoot || post.replyParent
        ? db.db
            .selectFrom('para_post')
            .selectAll('para_post')
            .where(
              'uri',
              'in',
              [post.replyRoot, post.replyParent].filter(
                (uri): uri is string => !!uri,
              ),
            )
            .orderBy('sortAt', 'asc')
            .limit(req.above || 80)
            .execute()
        : [],
      db.db
        .selectFrom('para_post')
        .selectAll('para_post')
        .where((eb) =>
          eb.or([
            eb('replyRoot', '=', post.uri),
            eb('replyParent', '=', post.uri),
          ]),
        )
        .orderBy('sortAt', 'asc')
        .limit(req.below || 6)
        .execute(),
    ])

    return {
      post: paraFeedItemFromRow(post),
      parents: parents.map(paraFeedItemFromRow),
      replies: replies.map(paraFeedItemFromRow),
    }
  },

  async getParaOpenQuestionThread(req) {
    const post = await db.db
      .selectFrom('para_post')
      .selectAll('para_post')
      .where('uri', '=', req.postUri)
      .executeTakeFirst()

    if (!post) {
      return {}
    }

    const depth = req.depth || 6
    const replies = await db.db
      .selectFrom('para_post')
      .selectAll('para_post')
      .where((eb) =>
        eb.or([
          eb('replyRoot', '=', post.uri),
          eb('replyParent', '=', post.uri),
        ]),
      )
      .orderBy('sortAt', 'asc')
      .limit(1000)
      .execute()

    const replyUris = replies.map((reply) => reply.uri)
    const [scores, viewerVotes] = await Promise.all([
      replyUris.length
        ? db.db
            .selectFrom('para_open_question_vote')
            .where('subject', 'in', replyUris)
            .select([
              'subject',
              sql<number>`coalesce(sum("value"), 0)`.as('score'),
            ])
            .groupBy('subject')
            .execute()
        : [],
      req.viewerDid && replyUris.length
        ? db.db
            .selectFrom('para_open_question_vote')
            .where('creator', '=', req.viewerDid)
            .where('subject', 'in', replyUris)
            .select(['subject', 'value'])
            .execute()
        : [],
    ])

    const scoreByUri = new Map<string, number>(
      scores.map((row) => [row.subject, Number(row.score) || 0] as const),
    )
    const viewerVoteByUri = new Map<string, number>(
      viewerVotes.map((row) => [row.subject, Number(row.value) || 0] as const),
    )

    return {
      post: paraFeedItemFromRow(post),
      replies: buildOpenQuestionReplyTree({
        rootUri: post.uri,
        replies,
        scoreByUri,
        viewerVoteByUri,
        depth,
      }),
    }
  },

  async getAuthorFeed(req) {
    const { actorDid, limit, cursor, feedType } = req
    const { ref } = db.db.dynamic
    // defaults to posts, reposts, and replies
    let builder = db.db
      .selectFrom('feed_item')
      .innerJoin('post', 'post.uri', 'feed_item.postUri')
      .selectAll('feed_item')
      .where('originatorDid', '=', actorDid)
    if (feedType === FeedType.POSTS_WITH_MEDIA) {
      builder = builder
        // only your own posts
        .where('type', '=', 'post')
        // only posts with media
        // (upstream also matches post_embed_gallery_image, a table this
        // fork's schema does not have yet)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('post_embed_image')
              .select('post_embed_image.postUri')
              .whereRef('post_embed_image.postUri', '=', 'feed_item.postUri'),
          ),
        )
    } else if (feedType === FeedType.POSTS_WITH_VIDEO) {
      builder = builder
        // only your own posts
        .where('type', '=', 'post')
        // only posts with video
        .where(({ eb, exists }) =>
          exists(
            eb
              .selectFrom('post_embed_video')
              .select('post_embed_video.postUri')
              .whereRef('post_embed_video.postUri', '=', 'feed_item.postUri'),
          ),
        )
    } else if (feedType === FeedType.POSTS_NO_REPLIES) {
      builder = builder.where((eb) =>
        eb.or([eb('post.replyParent', 'is', null), eb('type', '=', 'repost')]),
      )
    } else if (feedType === FeedType.POSTS_AND_AUTHOR_THREADS) {
      builder = builder.where((eb) =>
        eb.or([
          eb('type', '=', 'repost'),
          eb('post.replyParent', 'is', null),
          eb('post.replyRoot', 'like', `at://${actorDid}/%`),
        ]),
      )
    }
    const keyset = new TimeCidKeyset(
      ref('feed_item.sortAt'),
      ref('feed_item.cid'),
    )
    builder = paginate(builder, {
      limit,
      cursor,
      keyset,
    })
    const page = keyset.page(await builder.execute(), limit)
    return {
      items: page.items.map(feedItemFromRow),
      cursor: page.cursor,
    }
  },
  async getTimeline(req) {
    const { actorDid, limit, cursor, since } = req
    const { ref } = db.db.dynamic
    const keyset = new TimeCidKeyset(
      ref('feed_item.sortAt'),
      ref('feed_item.cid'),
    )
    assertValidSince(keyset, since)
    let followQb = db.db
      .selectFrom('feed_item')
      .innerJoin('follow', 'follow.subjectDid', 'feed_item.originatorDid')
      .where('follow.creator', '=', actorDid)
      .selectAll('feed_item')
    followQb = paginate(followQb, {
      limit,
      cursor,
      since,
      keyset,
      tryIndex: true,
    })
    let selfQb = db.db
      .selectFrom('feed_item')
      .where('feed_item.originatorDid', '=', actorDid)
      .selectAll('feed_item')
    selfQb = paginate(selfQb, {
      limit,
      cursor,
      since,
      keyset,
      tryIndex: true,
    })
    const [followRes, selfRes] = await Promise.all([
      followQb.execute(),
      selfQb.execute(),
    ])
    // Use own posts to fill space left by followed-account posts. When followed-account
    // posts already fill the page, still allow up to 10 own posts into the merged results.
    const selfLimit = Math.max(
      // Allow up to 10 own posts even when followed-account posts can fill the page.
      Math.min(limit, 10),
      // Allow enough own posts to fill the slots not occupied by followed-account posts.
      limit - Math.min(followRes.length, limit),
    )
    // The extra own post proves that another page exists, but is not part of this page.
    const selfHasMore = selfRes.length > selfLimit
    const selfItems = selfRes.slice(0, selfLimit)
    const feedItems = [...followRes, ...selfItems].sort((a, b) => {
      if (a.sortAt > b.sortAt) return -1
      if (a.sortAt < b.sortAt) return 1
      return a.cid > b.cid ? -1 : 1
    })
    const page = keyset.page(feedItems, limit)
    if (page.items.length === 0) {
      return { items: [], cursor: exhaustedCursor(since) }
    }
    const items = page.items.map(feedItemFromRow)
    const startCursor = keyset.packFromResult(page.items[0])
    // The combined results exceeded the requested limit.
    if (page.cursor) {
      return { items, cursor: page.cursor, startCursor }
    }
    // Own posts exceeded their separate cap, but the combined results did not exceed the requested limit.
    if (selfHasMore) {
      const lastItem = page.items.at(-1)
      assert(lastItem)
      return { items, cursor: keyset.packFromResult(lastItem), startCursor }
    }
    return { items, cursor: exhaustedCursor(since), startCursor }
  },
  async getListFeed(req) {
    const { listUri, cursor, since, limit } = req
    const { ref } = db.db.dynamic

    let builder = db.db
      .selectFrom('post')
      .selectAll('post')
      .innerJoin('list_item', 'list_item.subjectDid', 'post.creator')
      .where('list_item.listUri', '=', listUri)

    // Upstream additionally excludes creators who opted out of reference lists
    // (list purpose app.bsky.graph.defs#referencelist) via the
    // reference_list_opt_out table, which this fork's schema does not have yet.

    const keyset = new TimeCidKeyset(ref('post.sortAt'), ref('post.cid'))
    assertValidSince(keyset, since)
    builder = paginate(builder, {
      limit,
      cursor,
      since,
      keyset,
      tryIndex: true,
    })
    const page = keyset.page(await builder.execute(), limit)
    const firstItem = page.items[0]
    return {
      items: page.items.map((item) => ({ uri: item.uri, cid: item.cid })),
      cursor: page.cursor ?? exhaustedCursor(since),
      startCursor: firstItem ? keyset.packFromResult(firstItem) : undefined,
    }
  },
})

/**
 * A `since`-bounded request never reports exhaustion with an empty cursor: it
 * echoes `since`, a position the client can keep paginating below.
 */
const exhaustedCursor = (since: string) => since || undefined

/**
 * Rejects a `since` the keyset cannot unpack. Left to `paginate` it would raise
 * an xrpc error, which a Connect handler reports as an internal error.
 */
const assertValidSince = (keyset: TimeCidKeyset, since: string) => {
  if (!since) return
  try {
    keyset.unpack(since)
  } catch {
    throw new ConnectError('Malformed since cursor', Code.InvalidArgument)
  }
}

// @NOTE does not support additional fields in the protos specific to author feeds
// and timelines. at the time of writing, hydration/view implementations do not rely on them.
const feedItemFromRow = (row: { postUri: string; uri: string }) => {
  return {
    uri: row.postUri,
    repost: row.uri === row.postUri ? undefined : row.uri,
  }
}

const paraMetaMatches = (column: 'party' | 'community', value: string) => {
  const candidates = paraMetaCandidates(value)
  return column === 'party'
    ? sql<boolean>`lower(coalesce("para_post"."party", '')) in (${sql.join(
        candidates,
      )})`
    : sql<boolean>`lower(coalesce("para_post"."community", '')) in (${sql.join(
        candidates,
      )})`
}

const paraMetaCandidates = (value: string) => {
  const raw = value.trim().toLowerCase()
  const withoutPrefix = raw.replace(/^p\//, '')
  return [...new Set([raw, withoutPrefix, `p/${withoutPrefix}`])]
}

const paraFlairMatches = (flairTag: string) => {
  const candidates = paraFlairCandidates(flairTag)
  return sql<boolean>`exists (
    select 1
    from jsonb_array_elements_text(coalesce("para_post"."flairs", '[]'::jsonb)) as flair
    where lower(flair.value) in (${sql.join(candidates)})
  )`
}

const paraFlairCandidates = (flairTag: string) => {
  const raw = flairTag.trim().toLowerCase()
  if (!raw) return ['']
  const withoutHash = raw.replace('#', '')
  const withoutBars = raw.replace(/^\|+#?/, '')
  const officialized = raw.startsWith('||#')
    ? raw
    : raw.startsWith('|#')
      ? `||#${raw.slice(2)}`
      : `||#${withoutBars}`
  const standardized = raw.startsWith('|#')
    ? raw
    : raw.startsWith('||#')
      ? `|#${raw.slice(3)}`
      : `|#${withoutBars}`
  return [...new Set([raw, withoutHash, standardized, officialized])]
}

const paraPostTypeMatches = (postType: string) => {
  const raw = postType.trim().toLowerCase()
  return sql<boolean>`lower(coalesce("para_post"."postType", '')) = ${raw}`
}

const paraFeedItemFromRow = (row: {
  uri: string
  cid: string
  creator: string
  text: string
  createdAt: string
  replyRoot: string | null
  replyParent: string | null
  langs: string[] | null
  tags: string[] | null
  flairs: string[] | null
  postType: string | null
}): ParaAuthorFeedItem => {
  return new ParaAuthorFeedItem({
    uri: row.uri,
    cid: row.cid,
    author: row.creator,
    text: row.text,
    createdAt: row.createdAt,
    replyRoot: row.replyRoot ?? undefined,
    replyParent: row.replyParent ?? undefined,
    langs: row.langs ?? [],
    tags: row.tags ?? [],
    flairs: row.flairs ?? [],
    postType: row.postType ?? undefined,
  })
}

const buildOpenQuestionReplyTree = (opts: {
  rootUri: string
  replies: Array<{
    uri: string
    cid: string
    creator: string
    text: string
    createdAt: string
    replyParent: string | null
  }>
  scoreByUri: Map<string, number>
  viewerVoteByUri: Map<string, number>
  depth: number
}): ParaOpenQuestionReplyItem[] => {
  const { rootUri, replies, scoreByUri, viewerVoteByUri, depth } = opts
  const childrenByParent = new Map<string, typeof replies>()
  for (const reply of replies) {
    const parent = reply.replyParent || rootUri
    const children = childrenByParent.get(parent) ?? []
    children.push(reply)
    childrenByParent.set(parent, children)
  }

  const visit = (
    parentUri: string,
    currentDepth: number,
  ): ParaOpenQuestionReplyItem[] => {
    if (currentDepth > depth) return []
    return (childrenByParent.get(parentUri) ?? []).map(
      (reply) =>
        new ParaOpenQuestionReplyItem({
          uri: reply.uri,
          cid: reply.cid,
          author: reply.creator,
          text: reply.text,
          createdAt: reply.createdAt,
          voteScore: scoreByUri.get(reply.uri) ?? 0,
          viewerVote: viewerVoteByUri.get(reply.uri) ?? 0,
          replies: visit(reply.uri, currentDepth + 1),
        }),
    )
  }

  return visit(rootUri, 1)
}
