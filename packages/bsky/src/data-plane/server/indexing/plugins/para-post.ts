// @ts-nocheck
import { Insertable, Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { Notification } from '../../db/tables/notification.js'
import { deletePostDiscourse, indexPostDiscourse } from '../discourse-indexing.js'
import { RecordProcessor } from '../processor.js'
import { recomputeParaProfileStats } from './para-profile-stats.js'

interface ParaPostRecord {
  text: string
  createdAt: string
  reply?: {
    root: { uri: string; cid: string }
    parent: { uri: string; cid: string }
  }
  embed?: unknown
  langs?: string[]
  labels?: unknown
  tags?: string[]
  flairs?: string[]
  postType?: string
  party?: string
  community?: string
}

type Notif = Insertable<Notification>
type ParaPost = Selectable<DatabaseSchemaType['para_post']>
type IndexedParaPost = {
  post: ParaPost
  facets?: { type: 'mention' | 'link'; value: string }[]
}

const lexId = 'com.para.post'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaPostRecord,
  timestamp: string,
): Promise<IndexedParaPost | null> => {
  const post = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    text: obj.text,
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    replyRoot: obj.reply?.root?.uri || null,
    replyRootCid: obj.reply?.root?.cid || null,
    replyParent: obj.reply?.parent?.uri || null,
    replyParentCid: obj.reply?.parent?.cid || null,
    langs: obj.langs?.length
      ? sql<string[]>`${JSON.stringify(obj.langs)}`
      : null,
    tags: obj.tags?.length ? sql<string[]>`${JSON.stringify(obj.tags)}` : null,
    flairs: obj.flairs?.length
      ? sql<string[]>`${JSON.stringify(obj.flairs)}`
      : null,
    postType: obj.postType || null,
    party: obj.party || null,
    community: obj.community || null,
    indexedAt: timestamp,
  }

  const [insertedPost] = await Promise.all([
    db
      .insertInto('para_post')
      .values(post)
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst(),
    db
      .insertInto('feed_item')
      .values({
        type: 'post',
        uri: post.uri,
        cid: post.cid,
        postUri: post.uri,
        originatorDid: post.creator,
        sortAt:
          post.indexedAt < post.createdAt ? post.indexedAt : post.createdAt,
      })
      .onConflict((oc) => oc.doNothing())
      .executeTakeFirst(),
  ])

  if (!insertedPost) {
    return null
  }

  await indexPostDiscourse(db, uri, obj.text, timestamp)

  return {
    post: insertedPost,
    facets: [],
  }
}

const findDuplicate = async (
  db: DatabaseSchema,
  uri: AtUri,
  obj: ParaPostRecord,
): Promise<AtUri | null> => {
  const found = await db
    .selectFrom('para_post')
    .where('creator', '=', uri.host)
    .where('text', '=', obj.text)
    .where('createdAt', '=', normalizeDatetimeAlways(obj.createdAt))
    .select('uri')
    .executeTakeFirst()
  return found ? new AtUri(found.uri) : null
}

const notifsForInsert = (_obj: IndexedParaPost) => {
  return [] as Notif[]
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedParaPost | null> => {
  const [deleted] = await Promise.all([
    db
      .deleteFrom('para_post')
      .where('uri', '=', uri.toString())
      .returningAll()
      .executeTakeFirst(),
    db
      .deleteFrom('feed_item')
      .where('postUri', '=', uri.toString())
      .executeTakeFirst(),
    db
      .deleteFrom('para_post_meta')
      .where('postUri', '=', uri.toString())
      .executeTakeFirst(),
    deletePostDiscourse(db, uri),
  ])

  return deleted
    ? {
        post: deleted,
        facets: [],
      }
    : null
}

const notifsForDelete = (
  deleted: IndexedParaPost,
  replacedBy: IndexedParaPost | null,
) => {
  const notifs = replacedBy ? notifsForInsert(replacedBy) : []
  return {
    notifs,
    toDelete: [deleted.post.uri],
  }
}

const updateAggregates = async (
  db: DatabaseSchema,
  postIdx: IndexedParaPost,
) => {
  await recomputeParaProfileStats(db, postIdx.post.creator)
}

export type PluginType = RecordProcessor<ParaPostRecord, IndexedParaPost>

export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
): PluginType => {
  return new RecordProcessor(db, background, {
    lexId,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
    updateAggregates,
  })
}

export default makePlugin
