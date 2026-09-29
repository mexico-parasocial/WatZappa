// @ts-nocheck
import type { Selectable } from 'kysely'
import type { CID } from 'multiformats/cid'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import {
  deletePostDiscourse,
  indexPostDiscourse,
} from '../discourse-indexing.js'
import { RecordProcessor } from '../processor.js'
import { finalizeDueCabildeos } from './finalize-cabildeos.js'
import { recomputeCabildeoAggregates } from './recompute-cabildeo-aggregates.js'

interface PositionRecord {
  cabildeo: string
  stance: string
  optionIndex?: number
  text: string
  compassQuadrant?: string
  createdAt: string
}

type CabildeoPosition = Selectable<DatabaseSchemaType['cabildeo_position']>
type IndexedPosition = {
  record: CabildeoPosition
}

const lexId = 'com.para.civic.position'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: PositionRecord,
  timestamp: string,
): Promise<IndexedPosition | null> => {
  await finalizeDueCabildeos(db)
  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    cabildeo: obj.cabildeo,
    stance: obj.stance,
    optionIndex: obj.optionIndex ?? null,
    text: obj.text,
    compassQuadrant: obj.compassQuadrant || null,
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  const inserted = await db
    .insertInto('cabildeo_position')
    .values(record)
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  if (!inserted) {
    return null
  }

  await indexPostDiscourse(db, uri, obj.text, timestamp)

  return { record: inserted }
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
): Promise<IndexedPosition | null> => {
  await finalizeDueCabildeos(db)
  const deleted = await db
    .deleteFrom('cabildeo_position')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  await deletePostDiscourse(db, uri)

  return deleted ? { record: deleted } : null
}

const notifsForDelete = (
  deleted: IndexedPosition,
  _replacedBy: IndexedPosition | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

const updateAggregates = async (
  db: DatabaseSchema,
  indexed: IndexedPosition,
) => {
  await recomputeCabildeoAggregates(db, indexed.record.cabildeo)
}

export type PluginType = RecordProcessor<PositionRecord, IndexedPosition>

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
