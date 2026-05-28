// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface StrongRef {
  uri: string
  cid: string
}

interface ParaCommunitySharedContentRecord {
  subject: StrongRef
  communityUri: string
  contentType: string
  sharedBy: string
  note?: string
  visibility?: string
  sourceApp?: string
  embedContext?: unknown
  pinned?: boolean
  sortRank?: number
  createdAt: string
}

type IndexedParaCommunitySharedContent = Selectable<
  DatabaseSchemaType['para_community_shared_content']
>

const lexId = 'com.para.community.sharedContent'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaCommunitySharedContentRecord,
  timestamp: string,
): Promise<IndexedParaCommunitySharedContent | null> => {
  const inserted = await db
    .insertInto('para_community_shared_content')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      rkey: uri.rkey,
      subjectUri: obj.subject.uri,
      subjectCid: obj.subject.cid,
      communityUri: obj.communityUri,
      contentType: obj.contentType,
      sharedBy: obj.sharedBy,
      note: obj.note ?? null,
      visibility: obj.visibility ?? null,
      sourceApp: obj.sourceApp ?? null,
      embedContext:
        obj.embedContext === undefined
          ? null
          : sql`${JSON.stringify(obj.embedContext)}`,
      pinned: obj.pinned ?? false,
      sortRank: obj.sortRank ?? null,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (
  db: DatabaseSchema,
  _uri: AtUri,
  obj: ParaCommunitySharedContentRecord,
): Promise<AtUri | null> => {
  const found = await db
    .selectFrom('para_community_shared_content')
    .where('communityUri', '=', obj.communityUri)
    .where('subjectUri', '=', obj.subject.uri)
    .select('uri')
    .executeTakeFirst()

  return found ? new AtUri(found.uri) : null
}

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedParaCommunitySharedContent | null> => {
  const deleted = await db
    .deleteFrom('para_community_shared_content')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = () => ({ notifs: [], toDelete: [] })

export type PluginType = RecordProcessor<
  ParaCommunitySharedContentRecord,
  IndexedParaCommunitySharedContent
>

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
  })
}

export default makePlugin
