// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { deletePostDiscourse, indexPostDiscourse } from '../discourse-indexing.js'
import { RecordProcessor } from '../processor.js'
import { recomputeParaProfileStats } from './para-profile-stats.js'

interface OpenQuestionRecord {
  text: string
  community?: string
  tags?: string[]
  createdAt: string
}

type ParaPost = Selectable<DatabaseSchemaType['para_post']>

const lexId = 'com.para.civic.openQuestion'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: OpenQuestionRecord,
  timestamp: string,
): Promise<ParaPost | null> => {
  const post = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    text: obj.text,
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    replyRoot: null,
    replyRootCid: null,
    replyParent: null,
    replyParentCid: null,
    langs: null,
    tags: obj.tags?.length ? sql<string[]>`${JSON.stringify(obj.tags)}` : null,
    flairs: null,
    postType: 'open_question',
    party: null,
    community: obj.community || null,
    indexedAt: timestamp,
  }

  const [inserted] = await Promise.all([
    db
      .insertInto('para_post')
      .values(post)
      .onConflict((oc) =>
        oc.column('uri').doUpdateSet({
          cid: post.cid,
          text: post.text,
          tags: post.tags,
          community: post.community,
          createdAt: post.createdAt,
          indexedAt: post.indexedAt,
        }),
      )
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
      .onConflict((oc) =>
        oc.column('uri').doUpdateSet({
          cid: post.cid,
          sortAt:
            post.indexedAt < post.createdAt ? post.indexedAt : post.createdAt,
        }),
      )
      .executeTakeFirst(),
  ])

  if (!inserted) {
    return null
  }

  await indexPostDiscourse(db, uri, obj.text, timestamp)
  return inserted
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<ParaPost | null> => {
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

  return deleted ?? null
}

const notifsForDelete = (deleted: ParaPost, replacedBy: ParaPost | null) => {
  const notifs = replacedBy ? notifsForInsert() : []
  return {
    notifs,
    toDelete: [deleted.uri],
  }
}

const updateAggregates = async (db: DatabaseSchema, post: ParaPost) => {
  await recomputeParaProfileStats(db, post.creator)
}

export type PluginType = RecordProcessor<OpenQuestionRecord, ParaPost>

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
