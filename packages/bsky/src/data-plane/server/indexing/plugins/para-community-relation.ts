// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface ParaCommunityRelationRecord {
  parentCommunityUri: string
  childCommunityUri: string
  relation: 'parentChild'
  createdAt: string
}

type IndexedParaCommunityRelation = Selectable<
  DatabaseSchemaType['para_community_relation']
>

const lexId = 'com.para.community.relation'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaCommunityRelationRecord,
  timestamp: string,
): Promise<IndexedParaCommunityRelation | null> => {
  if (obj.parentCommunityUri === obj.childCommunityUri) {
    return null
  }
  const directCycle = await db
    .selectFrom('para_community_relation')
    .where('parentCommunityUri', '=', obj.childCommunityUri)
    .where('childCommunityUri', '=', obj.parentCommunityUri)
    .where('relation', '=', obj.relation)
    .select('uri')
    .executeTakeFirst()
  if (directCycle) {
    return null
  }

  const inserted = await db
    .insertInto('para_community_relation')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      rkey: uri.rkey,
      parentCommunityUri: obj.parentCommunityUri,
      childCommunityUri: obj.childCommunityUri,
      relation: obj.relation,
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
  obj: ParaCommunityRelationRecord,
): Promise<AtUri | null> => {
  const found = await db
    .selectFrom('para_community_relation')
    .where('parentCommunityUri', '=', obj.parentCommunityUri)
    .where('childCommunityUri', '=', obj.childCommunityUri)
    .where('relation', '=', obj.relation)
    .select('uri')
    .executeTakeFirst()

  return found ? new AtUri(found.uri) : null
}

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedParaCommunityRelation | null> => {
  const deleted = await db
    .deleteFrom('para_community_relation')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = () => ({ notifs: [], toDelete: [] })

export type PluginType = RecordProcessor<
  ParaCommunityRelationRecord,
  IndexedParaCommunityRelation
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
