import { AtUri } from '@atproto/syntax'
import { DatabaseSchema } from '../db/database-schema.js'
import { analyzeDiscourse } from './discourse-nlp.js'

export async function indexPostDiscourse(
  db: DatabaseSchema,
  uri: AtUri,
  text: string,
  timestamp: string,
  community?: string | null,
) {
  const analysis = analyzeDiscourse(text)

  await db
    .insertInto('para_sentiment_aggregate')
    .values({
      postUri: uri.toString(),
      creator: uri.host,
      community: community || null,
      sentimentLabel: analysis.sentiment.label,
      sentimentScore: analysis.sentiment.score,
      constructiveness: analysis.constructiveness,
      keywords: JSON.stringify(analysis.keywords),
      indexedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('postUri').doUpdateSet({
        community: community || null,
        sentimentLabel: analysis.sentiment.label,
        sentimentScore: analysis.sentiment.score,
        constructiveness: analysis.constructiveness,
        keywords: JSON.stringify(analysis.keywords),
        indexedAt: timestamp,
      }),
    )
    .execute()
}

export async function updatePostDiscourseCommunity(
  db: DatabaseSchema,
  postUri: string,
  community: string,
) {
  await db
    .updateTable('para_sentiment_aggregate')
    .set({ community })
    .where('postUri', '=', postUri)
    .execute()
}

export async function deletePostDiscourse(db: DatabaseSchema, uri: AtUri) {
  await db
    .deleteFrom('para_sentiment_aggregate')
    .where('postUri', '=', uri.toString())
    .execute()
}
