// @ts-nocheck
import { Selectable } from 'kysely'
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

interface ParaCommunitySharedContentActionRecord {
  sharedContent: StrongRef
  communityUri: string
  action: 'remove' | 'restore' | 'pin' | 'unpin'
  note?: string
  createdAt: string
}

type IndexedParaCommunitySharedContentAction = Selectable<
  DatabaseSchemaType['para_community_shared_content_action']
>

const lexId = 'com.para.community.sharedContentAction'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaCommunitySharedContentActionRecord,
  timestamp: string,
): Promise<IndexedParaCommunitySharedContentAction | null> => {
  const inserted = await db
    .insertInto('para_community_shared_content_action')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      rkey: uri.rkey,
      sharedContentUri: obj.sharedContent.uri,
      sharedContentCid: obj.sharedContent.cid,
      communityUri: obj.communityUri,
      action: obj.action,
      note: obj.note ?? null,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => null
const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedParaCommunitySharedContentAction | null> => {
  const deleted = await db
    .deleteFrom('para_community_shared_content_action')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = () => ({ notifs: [], toDelete: [] })

export type PluginType = RecordProcessor<
  ParaCommunitySharedContentActionRecord,
  IndexedParaCommunitySharedContentAction
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
