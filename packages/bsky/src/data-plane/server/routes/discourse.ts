import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { sentimentAggregateTableName } from '../db/tables/discourse.js'
import { tableName as paraPostMetaTableName } from '../db/tables/para-post-meta.js'
import { tableName as postTableName } from '../db/tables/post.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaDiscourseSnapshot(req) {
    const { community, timeframe } = req
    const normalizedCommunity = normalizeCommunity(community)

    // In a real system, we'd query the para_discourse_snapshot table.
    // For this MVP, we perform on-the-fly aggregation from para_sentiment_aggregate
    // to ensure the user sees data immediately after indexing.

    let builder = db.db
      .selectFrom(sentimentAggregateTableName)
      .select([
        sql`count(*)`.as('postCount'),
        sql`count(distinct creator)`.as('uniqueAuthors'),
        sql`avg(constructiveness)`.as('avgConstructiveness'),
        // Simulating buckets by truncating indexedAt to the hour
        sql`date_trunc('hour', "indexedAt"::timestamptz)`.as('bucket'),
      ])
      .groupBy(sql`date_trunc('hour', "indexedAt"::timestamptz)`)
      .orderBy(sql`bucket`, 'desc')

    if (normalizedCommunity) {
      builder = builder.where('community', '=', normalizedCommunity)
    }

    const interval = timeframeToInterval(timeframe)
    builder = builder.where(
      'indexedAt',
      '>',
      sql`now() - ${interval}::interval`,
    )

    const rows = await builder.execute()

    return {
      snapshots: rows.map((row: any) => ({
        community: normalizedCommunity,
        bucket: new Date(row.bucket).toISOString(),
        postCount: Number(row.postCount),
        uniqueAuthors: Number(row.uniqueAuthors),
        avgConstructiveness: Number(row.avgConstructiveness || 0),
        semanticVolatility: 0.1, // Placeholder
        lexicalDiversity: 0.65, // Placeholder
        polarizationDelta: 0.2, // Placeholder
        echoChamberIndex: 0.15, // Placeholder
        topKeywords: JSON.stringify([]),
        sentimentDistribution: JSON.stringify({}),
      })),
    }
  },

  async getParaDiscourseTopics(req) {
    const { community, timeframe } = req
    const normalizedCommunity = normalizeCommunity(community)

    // On-the-fly extraction of top keywords from the sentiment aggregate
    // This is a simplified version of topic clustering.
    let builder = db.db
      .selectFrom(sentimentAggregateTableName)
      .select([
        sql`jsonb_array_elements_text(keywords)`.as('keyword'),
        sql`count(*)`.as('count'),
        sql`avg("sentimentScore")`.as('avgSentiment'),
      ])
      .groupBy('keyword')
      .orderBy('count', 'desc')
      .limit(10)

    if (normalizedCommunity) {
      builder = builder.where('community', '=', normalizedCommunity)
    }

    const interval = timeframeToInterval(timeframe)
    builder = builder.where(
      'indexedAt',
      '>',
      sql`now() - ${interval}::interval`,
    )

    const rows = await builder.execute()

    return {
      topics: rows.map((row: any) => ({
        clusterLabel: row.keyword,
        keywords: JSON.stringify([row.keyword]),
        postCount: Number(row.count),
        authorCount: Math.ceil(Number(row.count) * 0.8), // Heuristic
        avgSentiment: Number(row.avgSentiment || 0),
      })),
    }
  },

  async getParaDiscourseSentiment(req) {
    const { community, timeframe } = req
    const normalizedCommunity = normalizeCommunity(community)

    let builder = db.db
      .selectFrom(sentimentAggregateTableName)
      .select(['sentimentLabel', sql`count(*)`.as('count')])
      .groupBy('sentimentLabel')

    if (normalizedCommunity) {
      builder = builder.where('community', '=', normalizedCommunity)
    }

    const interval = timeframeToInterval(timeframe)
    builder = builder.where(
      'indexedAt',
      '>',
      sql`now() - ${interval}::interval`,
    )

    const rows = await builder.execute()
    const total = rows.reduce((acc, row) => acc + Number(row.count), 0) || 1

    const distribution = {
      anger: 0,
      fear: 0,
      trust: 0,
      uncertainty: 0,
      neutral: 0,
    }

    rows.forEach((row: any) => {
      if (row.sentimentLabel in distribution) {
        distribution[row.sentimentLabel] = Number(row.count) / total
      }
    })

    return { sentiment: distribution }
  },

  async getParaTrendingTopics(req) {
    const { limit, timeframe } = req
    const interval = timeframeToInterval(timeframe || '24h')
    const maxResults = limit && limit > 0 ? Math.min(limit, 25) : 14

    // 1. Extract hashtags from post.tags (JSONB array) in the time window
    const hashtagRows = await db.db
      .selectFrom(postTableName)
      .select([
        sql`jsonb_array_elements_text(tags)`.as('tag'),
        sql`count(*)`.as('count'),
      ])
      .where('tags', 'is not', null)
      .where('indexedAt', '>', sql`now() - ${interval}::interval`)
      .groupBy(sql`jsonb_array_elements_text(tags)`)
      .orderBy(sql`count(*)`, 'desc')
      .limit(maxResults)
      .execute()

    // 2. Extract communities from para_post_meta.community in the time window
    const communityRows = await db.db
      .selectFrom(paraPostMetaTableName)
      .select(['community', sql`count(*)`.as('count')])
      .where('community', 'is not', null)
      .where('indexedAt', '>', sql`now() - ${interval}::interval`)
      .groupBy('community')
      .orderBy(sql`count(*)`, 'desc')
      .limit(Math.ceil(maxResults / 2))
      .execute()

    // 3. Build trending topics from hashtags
    const hashtagTopics = (hashtagRows as any[]).map((row) => ({
      topic: row.tag,
      displayName: row.tag,
      link: `/search?q=${encodeURIComponent(row.tag)}`,
      description: `${row.count} posts`,
      postCount: Number(row.count),
      status:
        Number(row.count) >= 20
          ? 'hot'
          : Number(row.count) >= 10
            ? 'spiking'
            : 'stable',
      category: 'topic',
    }))

    // 4. Build trending topics from communities
    const communityTopics = (communityRows as any[]).map((row) => ({
      topic: row.community,
      displayName: row.community,
      link: `/search?q=${encodeURIComponent(row.community)}`,
      description: `${row.count} posts in community`,
      postCount: Number(row.count),
      status:
        Number(row.count) >= 20
          ? 'hot'
          : Number(row.count) >= 10
            ? 'spiking'
            : 'stable',
      category: 'community',
    }))

    // 5. Merge, dedupe by topic name, and sort by postCount
    const seen = new Set<string>()
    const merged: typeof hashtagTopics = []
    for (const t of [...hashtagTopics, ...communityTopics]) {
      const key = t.topic.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(t)
      }
    }
    merged.sort((a, b) => b.postCount - a.postCount)
    const topTopics = merged.slice(0, maxResults)

    return {
      topicsJson: JSON.stringify({
        topics: topTopics,
        suggested: [],
      }),
    }
  },
})

function timeframeToInterval(timeframe: string): string {
  switch (timeframe) {
    case '1h':
      return '1 hour'
    case '24h':
      return '24 hours'
    case '7d':
      return '7 days'
    case '30d':
      return '30 days'
    default:
      return '24 hours'
  }
}

function normalizeCommunity(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/^p\//, '') || ''
}
