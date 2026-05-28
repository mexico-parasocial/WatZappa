export const discourseSnapshotTableName = 'para_discourse_snapshot'
export const topicClusterTableName = 'para_topic_cluster'
export const sentimentAggregateTableName = 'para_sentiment_aggregate'

export interface DiscourseSnapshot {
  id: number
  community: string
  bucket: string
  postCount: number
  uniqueAuthors: number
  avgConstructiveness: number | null
  semanticVolatility: number | null
  lexicalDiversity: number | null
  polarizationDelta: number | null
  echoChamberIndex: number | null
  topKeywords: unknown | null // JSON array of weighted terms
  sentimentDistribution: unknown | null // JSON object {anger, fear, trust, ...}
  indexedAt: string
}

export interface TopicCluster {
  id: number
  community: string
  bucket: string
  clusterLabel: string
  keywords: unknown | null // JSON array of weighted terms
  postCount: number
  authorCount: number
  avgSentiment: number | null
  indexedAt: string
}

export interface SentimentAggregate {
  postUri: string
  creator: string
  community: string | null
  sentimentLabel: string
  sentimentScore: number
  constructiveness: number | null
  compassQuadrant: string | null
  keywords: unknown | null // JSON array of extracted terms
  indexedAt: string
}

export type PartialDB = {
  [discourseSnapshotTableName]: DiscourseSnapshot
  [topicClusterTableName]: TopicCluster
  [sentimentAggregateTableName]: SentimentAggregate
}
