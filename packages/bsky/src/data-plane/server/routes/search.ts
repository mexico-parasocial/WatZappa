import { Timestamp } from '@bufbuild/protobuf'
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

const pgArrayLiteral = (arr: string[]) =>
  '{' +
  arr.map((s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')).join(',') +
  '}'

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

  type ResolvedActor = {
    did: string
    handle: string | null
  }

  const resolveActors = async (
    identifiers: string[] | undefined,
  ): Promise<ResolvedActor[]> => {
    if (!identifiers || identifiers.length === 0) return []
    const cleaned = identifiers.map((id) => id.replace(/^@/, ''))
    const dids = cleaned.filter((id) => id.startsWith('did:'))
    const handles = cleaned.filter((id) => !id.startsWith('did:'))
    if (dids.length === 0 && handles.length === 0) return []

    const rows = await db.db
      .selectFrom('actor')
      .where((eb) =>
        eb.or([
          handles.length > 0
            ? eb('actor.handle', 'in', handles)
            : eb.val(false),
          dids.length > 0 ? eb('actor.did', 'in', dids) : eb.val(false),
        ]),
      )
      .select(['actor.did', 'actor.handle'])
      .execute()

    const byDid = new Map(rows.map((r) => [r.did, r]))
    const byHandle = new Map(
      rows.filter((r) => r.handle).map((r) => [r.handle!, r]),
    )

    return cleaned
      .map((id): ResolvedActor | undefined => {
        if (id.startsWith('did:')) {
          const row = byDid.get(id)
          return { did: id, handle: row?.handle ?? null }
        }
        const row = byHandle.get(id)
        return row ? { did: row.did, handle: row.handle } : undefined
      })
      .filter((x): x is ResolvedActor => !!x)
  }

  const tsToIso = (ts: Timestamp | undefined): string | undefined => {
    if (!ts) return undefined
    const date = ts.toDate()
    if (isNaN(date.getTime())) return undefined
    return date.toISOString()
  }

  const extractHosts = (domains: string[] | undefined): string[] => {
    if (!domains) return []
    return domains
      .map((d) => {
        try {
          const url = d.includes('://') ? new URL(d) : new URL(`https://${d}`)
          return url.hostname
        } catch {
          return d
        }
      })
      .filter(Boolean)
  }

  const searchPostsImpl = async (_req: {
    term: string
    limit: number
    cursor?: string
    viewer?: string
    tags?: string[]
    postType?: string
    flairs?: string[]
    party?: string
    verifiedPublicFigure?: boolean
    state?: string
    districtKey?: string
    cabildeoPhase?: string
    authors?: string[]
    mentions?: string[]
    domains?: string[]
    urls?: string[]
    embeddedAtUris?: string[]
    since?: Timestamp
    until?: Timestamp
    language?: string
    excludeAuthors?: string[]
    excludeMentions?: string[]
    excludeDomains?: string[]
    excludeUrls?: string[]
    excludeEmbeddedAtUris?: string[]
    excludeHashtags?: string[]
    hasMedia?: boolean
    hasVideo?: boolean
    replyParentUri?: string
    threadRootUri?: string
    excludeReplies?: boolean
    repliesOnly?: boolean
    following?: boolean
  }) => {
    const {
      term,
      limit,
      cursor,
      viewer,
      tags,
      postType,
      flairs,
      party,
      verifiedPublicFigure,
      state,
      districtKey,
      cabildeoPhase,
      authors,
      mentions,
      domains,
      urls,
      embeddedAtUris,
      since,
      until,
      language,
      excludeAuthors,
      excludeMentions,
      excludeDomains,
      excludeUrls,
      excludeEmbeddedAtUris,
      excludeHashtags,
      hasMedia,
      hasVideo,
      replyParentUri,
      threadRootUri,
      excludeReplies,
      repliesOnly,
      following,
    } = _req

    const { q, author: parsedAuthor } = parsePostSearchQuery(term)

    const allAuthorInputs = parsedAuthor
      ? [...(authors ?? []), parsedAuthor]
      : (authors ?? [])
    const resolvedAuthors = await resolveActors(allAuthorInputs)
    const authorDids = resolvedAuthors.map((r) => r.did)

    if ((allAuthorInputs.length ?? 0) > 0 && authorDids.length === 0) {
      return { uris: [], cursor: '' }
    }

    const resolvedMentions = await resolveActors(mentions ?? [])
    const mentionHandles = resolvedMentions
      .map((r) => r.handle)
      .filter((h): h is string => !!h)

    if ((mentions ?? []).length > 0 && mentionHandles.length === 0) {
      return { uris: [], cursor: '' }
    }

    const resolvedExcludeAuthors = await resolveActors(excludeAuthors ?? [])
    const excludeAuthorDids = resolvedExcludeAuthors.map((r) => r.did)

    const resolvedExcludeMentions = await resolveActors(excludeMentions ?? [])
    const excludeMentionHandles = resolvedExcludeMentions
      .map((r) => r.handle)
      .filter((h): h is string => !!h)

    const effectiveDomains = extractHosts(domains)
    if ((domains ?? []).length > 0 && effectiveDomains.length === 0) {
      return { uris: [], cursor: '' }
    }

    const excludeDomainHosts = extractHosts(excludeDomains)

    const effectiveUrls = urls ?? []
    const effectiveEmbeddedAtUris = embeddedAtUris ?? []
    const excludeEffectiveUrls = excludeUrls ?? []
    const excludeEffectiveEmbeddedAtUris = excludeEmbeddedAtUris ?? []

    const sinceIso = tsToIso(since)
    const untilIso = tsToIso(until)

    const { ref } = db.db.dynamic

    type PostTable = 'post' | 'para_post'

    const baseFilters = <T extends PostTable>(qb: any, table: T) => {
      let qb2 = qb
      if (q) {
        qb2 = qb2.where(`${table}.text`, 'like', `%${q}%`)
      }
      if (authorDids.length > 0) {
        qb2 = qb2.where(`${table}.creator`, 'in', authorDids)
      }
      if (mentionHandles.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.or(
            mentionHandles.map((handle) =>
              eb(`${table}.text`, 'like', `%@${handle}%`),
            ),
          ),
        )
      }
      if (sinceIso) {
        qb2 = qb2.where(`${table}.sortAt`, '>=', sinceIso)
      }
      if (untilIso) {
        qb2 = qb2.where(`${table}.sortAt`, '<', untilIso)
      }
      if (language) {
        qb2 = qb2.where(
          sql<boolean>`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${sql.ref(`${table}.langs`)}) AS lang WHERE lang LIKE ${`${language}%`})`,
        )
      }
      if (effectiveDomains.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.or(
            effectiveDomains.map((domain) =>
              eb.exists(
                eb
                  .selectFrom('post_embed_external')
                  .select(sql`1`.as('one'))
                  .whereRef('post_embed_external.postUri', '=', `${table}.uri`)
                  .where('post_embed_external.uri', 'like', `%${domain}%`),
              ),
            ),
          ),
        )
      }
      if (effectiveUrls.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.or(
            effectiveUrls.map((url) =>
              eb.exists(
                eb
                  .selectFrom('post_embed_external')
                  .select(sql`1`.as('one'))
                  .whereRef('post_embed_external.postUri', '=', `${table}.uri`)
                  .where('post_embed_external.uri', '=', url),
              ),
            ),
          ),
        )
      }
      if (effectiveEmbeddedAtUris.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.exists(
            eb
              .selectFrom('post_embed_record')
              .select(sql`1`.as('one'))
              .whereRef('post_embed_record.postUri', '=', `${table}.uri`)
              .where(
                'post_embed_record.embedUri',
                'in',
                effectiveEmbeddedAtUris,
              ),
          ),
        )
      }
      if (excludeReplies) {
        qb2 = qb2.where(`${table}.replyRoot`, 'is', null)
      }
      if (repliesOnly) {
        qb2 = qb2.where(`${table}.replyRoot`, 'is not', null)
      }
      if (replyParentUri) {
        qb2 = qb2.where(`${table}.replyParent`, '=', replyParentUri)
      }
      if (threadRootUri) {
        qb2 = qb2.where(`${table}.replyRoot`, '=', threadRootUri)
      }
      if (hasMedia) {
        qb2 = qb2.where((eb) =>
          eb.or([
            eb.exists(
              eb
                .selectFrom('post_embed_image')
                .select(sql`1`.as('one'))
                .whereRef('post_embed_image.postUri', '=', `${table}.uri`),
            ),
            eb.exists(
              eb
                .selectFrom('post_embed_video')
                .select(sql`1`.as('one'))
                .whereRef('post_embed_video.postUri', '=', `${table}.uri`),
            ),
          ]),
        )
      }
      if (hasVideo) {
        qb2 = qb2.where((eb) =>
          eb.exists(
            eb
              .selectFrom('post_embed_video')
              .select(sql`1`.as('one'))
              .whereRef('post_embed_video.postUri', '=', `${table}.uri`),
          ),
        )
      }
      if (following && viewer) {
        qb2 = qb2.where((eb) =>
          eb.exists(
            eb
              .selectFrom('follow')
              .select(sql`1`.as('one'))
              .where('follow.creator', '=', viewer)
              .whereRef('follow.subjectDid', '=', `${table}.creator`),
          ),
        )
      }
      if (excludeAuthorDids.length > 0) {
        qb2 = qb2.where(`${table}.creator`, 'not in', excludeAuthorDids)
      }
      if (excludeMentionHandles.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.and(
            excludeMentionHandles.map((handle) =>
              eb(`${table}.text`, 'not like', `%@${handle}%`),
            ),
          ),
        )
      }
      if (excludeDomainHosts.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.and(
            excludeDomainHosts.map((domain) =>
              eb.not(
                eb.exists(
                  eb
                    .selectFrom('post_embed_external')
                    .select(sql`1`.as('one'))
                    .whereRef(
                      'post_embed_external.postUri',
                      '=',
                      `${table}.uri`,
                    )
                    .where('post_embed_external.uri', 'like', `%${domain}%`),
                ),
              ),
            ),
          ),
        )
      }
      if (excludeEffectiveUrls.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.and(
            excludeEffectiveUrls.map((url) =>
              eb.not(
                eb.exists(
                  eb
                    .selectFrom('post_embed_external')
                    .select(sql`1`.as('one'))
                    .whereRef(
                      'post_embed_external.postUri',
                      '=',
                      `${table}.uri`,
                    )
                    .where('post_embed_external.uri', '=', url),
                ),
              ),
            ),
          ),
        )
      }
      if (excludeEffectiveEmbeddedAtUris.length > 0) {
        qb2 = qb2.where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom('post_embed_record')
                .select(sql`1`.as('one'))
                .whereRef('post_embed_record.postUri', '=', `${table}.uri`)
                .where(
                  'post_embed_record.embedUri',
                  'in',
                  excludeEffectiveEmbeddedAtUris,
                ),
            ),
          ),
        )
      }
      if (excludeHashtags && excludeHashtags.length > 0) {
        qb2 = qb2.where(
          sql<boolean>`NOT (${sql.ref(`${table}.tags`)} ?& ${sql.lit(pgArrayLiteral(excludeHashtags))})`,
        )
      }
      return qb2
    }

    const hasParaOnlyFilters =
      postType ||
      flairs?.length ||
      party ||
      verifiedPublicFigure != null ||
      state ||
      districtKey ||
      cabildeoPhase

    let postBuilder = baseFilters(db.db.selectFrom('post'), 'post')
    if (tags && tags.length > 0) {
      postBuilder = postBuilder.where((eb) =>
        eb.or([
          sql<boolean>`${sql.ref('post.tags')} ?& ${sql.lit(pgArrayLiteral(tags))}`,
          eb('post.replyRoot', 'in', tags),
        ]),
      )
    }

    let paraPostBuilder = baseFilters(
      db.db.selectFrom('para_post'),
      'para_post',
    )
    if (tags && tags.length > 0) {
      paraPostBuilder = paraPostBuilder.where((eb) =>
        eb.or([
          sql<boolean>`${sql.ref('para_post.tags')} ?& ${sql.lit(pgArrayLiteral(tags))}`,
          eb('para_post.party', 'in', tags),
          eb('para_post.community', 'in', tags),
          eb('para_post.replyRoot', 'in', tags),
        ]),
      )
    }
    if (postType) {
      paraPostBuilder = paraPostBuilder.where(
        'para_post.postType',
        '=',
        postType,
      )
    }
    if (flairs && flairs.length > 0) {
      paraPostBuilder = paraPostBuilder.where(
        sql<boolean>`${sql.ref('para_post.flairs')} ?| ${sql.lit(pgArrayLiteral(flairs))}`,
      )
    }
    if (party) {
      paraPostBuilder = paraPostBuilder.where('para_post.party', '=', party)
    }
    if (verifiedPublicFigure != null) {
      paraPostBuilder = paraPostBuilder.where(
        'para_post.verifiedPublicFigure',
        '=',
        verifiedPublicFigure,
      )
    }
    if (state) {
      paraPostBuilder = paraPostBuilder.where('para_post.state', '=', state)
    }
    if (districtKey) {
      paraPostBuilder = paraPostBuilder.where(
        'para_post.districtKey',
        '=',
        districtKey,
      )
    }
    if (cabildeoPhase) {
      paraPostBuilder = paraPostBuilder.where(
        'para_post.cabildeoPhase',
        '=',
        cabildeoPhase,
      )
    }

    const combinedPosts = hasParaOnlyFilters
      ? paraPostBuilder.select(['uri', 'cid', 'sortAt'])
      : postBuilder
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
    async searchPosts(req) {
      try {
        return await searchPostsImpl(req)
      } catch (err) {
        console.error('searchPosts route error:', err)
        throw err
      }
    },

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
      const tags = [
        ...(req.filters?.hashtags ?? []),
        ...(req.filters?.communityUris ?? []),
        ...(req.filters?.cabildeoUris ?? []),
        ...(req.filters?.politicalCompassPositions ?? []),
      ]
      const { uris, cursor } = await searchPostsImpl({
        term: req.params?.query ?? '',
        limit: req.params?.limit ?? 25,
        cursor: req.params?.cursor,
        viewer: req.params?.viewer,
        tags: tags.length > 0 ? tags : undefined,
        authors: req.filters?.authors,
        mentions: req.filters?.mentions,
        domains: req.filters?.domains,
        urls: req.filters?.urls,
        embeddedAtUris: req.filters?.embeddedAtUris,
        since: req.since,
        until: req.until,
        language: req.language,
        excludeAuthors: req.exclude?.authors,
        excludeMentions: req.exclude?.mentions,
        excludeDomains: req.exclude?.domains,
        excludeUrls: req.exclude?.urls,
        excludeEmbeddedAtUris: req.exclude?.embeddedAtUris,
        excludeHashtags: req.exclude?.hashtags,
        hasMedia: req.hasMedia,
        hasVideo: req.hasVideo,
        replyParentUri: req.replyParentUri,
        threadRootUri: req.threadRootUri,
        excludeReplies: req.excludeReplies,
        repliesOnly: req.repliesOnly,
        following: req.following,
      })
      return {
        posts: uris.map((uri) => ({ uri, score: 0 })),
        pageInfo: { cursor: cursor ?? '', hitsTotal: 0n },
        detectedQueryLanguages: [],
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
