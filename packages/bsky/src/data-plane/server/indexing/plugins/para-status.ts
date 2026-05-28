// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface ParaStatusRecord {
  status: string
  party?: string
  community?: string
  createdAt: string
}

type IndexedParaStatus = Selectable<DatabaseSchemaType['para_status']>

const lexId = 'com.para.status'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaStatusRecord,
  timestamp: string,
): Promise<IndexedParaStatus | null> => {
  if (uri.rkey !== 'self') return null

  const inserted = await db
    .insertInto('para_status')
    .values({
      did: uri.host,
      uri: uri.toString(),
      cid: cid.toString(),
      status: obj.status,
      party: obj.party ?? null,
      community: obj.community ?? null,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('did').doUpdateSet({
        uri: uri.toString(),
        cid: cid.toString(),
        status: obj.status,
        party: obj.party ?? null,
        community: obj.community ?? null,
        createdAt: normalizeDatetimeAlways(obj.createdAt),
        indexedAt: timestamp,
      }),
    )
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const notifsForInsert = () => {
  return []
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedParaStatus | null> => {
  if (uri.rkey !== 'self') return null
  const deleted = await db
    .deleteFrom('para_status')
    .where('did', '=', uri.host)
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = () => {
  return { notifs: [], toDelete: [] }
}

export type PluginType = RecordProcessor<ParaStatusRecord, IndexedParaStatus>

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
