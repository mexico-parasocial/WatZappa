// @ts-nocheck
import { Insertable, Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
// eslint-disable-next-line import/no-unresolved
import { ParaCacheService } from '../../../cache/para-cache.js'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { Notification } from '../../db/tables/notification.js'
import { updatePostDiscourseCommunity } from '../discourse-indexing.js'
import { RecordProcessor } from '../processor.js'
import { recomputeParaProfileStats } from './para-profile-stats.js'

interface ParaPostMetaRecord {
  post: string
  postType: 'policy' | 'matter' | 'meme'
  official?: boolean
  party?: string
  community?: string
  category?: string
  tags?: string[]
  flairs?: string[]
  voteScore: number
  createdAt: string
}

type Notif = Insertable<Notification>
type ParaPostMeta = Selectable<DatabaseSchemaType['para_post_meta']>

const lexId = 'com.para.social.postMeta'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaPostMetaRecord,
  timestamp: string,
): Promise<ParaPostMeta | null> => {
  const postUri = new AtUri(obj.post)
  if (postUri.host !== uri.host) {
    return null
  }

  const inserted = await db
    .insertInto('para_post_meta')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      postUri: obj.post,
      postType: obj.postType,
      official: typeof obj.official === 'boolean' ? obj.official : null,
      party: obj.party ?? null,
      community: obj.community ?? null,
      category: obj.category ?? null,
      tags: obj.tags?.length
        ? sql<string[]>`${JSON.stringify(obj.tags)}`
        : null,
      flairs: obj.flairs?.length
        ? sql<string[]>`${JSON.stringify(obj.flairs)}`
        : null,
      voteScore: obj.voteScore ?? 0,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  if (inserted && obj.community) {
    await updatePostDiscourseCommunity(db, obj.post, obj.community)
  }

  return inserted ?? null
}

const findDuplicate = async (
  db: DatabaseSchema,
  _uri: AtUri,
  obj: ParaPostMetaRecord,
): Promise<AtUri | null> => {
  const found = await db
    .selectFrom('para_post_meta')
    .where('postUri', '=', obj.post)
    .select('uri')
    .executeTakeFirst()
  return found ? new AtUri(found.uri) : null
}

const notifsForInsert = (_obj: ParaPostMeta) => {
  return [] as Notif[]
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<ParaPostMeta | null> => {
  const deleted = await db
    .deleteFrom('para_post_meta')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (
  deleted: ParaPostMeta,
  replacedBy: ParaPostMeta | null,
) => {
  const notifs = replacedBy ? notifsForInsert(replacedBy) : []
  return {
    notifs,
    toDelete: [deleted.uri],
  }
}

const updateAggregates = async (db: DatabaseSchema, obj: ParaPostMeta) => {
  await recomputeParaProfileStats(db, obj.creator)
}

const invalidateCache = async (
  _db: DatabaseSchema,
  indexed: ParaPostMeta,
): Promise<string[]> => {
  const keys: string[] = []
  // Invalidate author feed for the creator
  keys.push(`authorFeed:${indexed.creator}:*`)
  // If post has a community, invalidate boards for that community
  if (indexed.community) {
    keys.push(`boards:${indexed.community}:*`)
  }
  // Invalidate profile stats for the creator
  keys.push(`profileStats:${indexed.creator}`)
  return keys
}

export type PluginType = RecordProcessor<ParaPostMetaRecord, ParaPostMeta>

export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
  paraCache?: ParaCacheService,
): PluginType => {
  return new RecordProcessor(
    db,
    background,
    {
      lexId,
      insertFn,
      findDuplicate,
      deleteFn,
      notifsForInsert,
      notifsForDelete,
      updateAggregates,
      invalidateCache: paraCache ? invalidateCache : undefined,
    },
    paraCache,
  )
}

export default makePlugin
