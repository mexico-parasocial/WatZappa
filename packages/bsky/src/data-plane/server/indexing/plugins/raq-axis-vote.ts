// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface AxisVoteRecord {
  axisId: string
  value?: number
  voteNullifier?: string
  eligibilityProofRef?: string
  createdAt: string
}

type AxisVote = Selectable<DatabaseSchemaType['raq_axis_vote']>
type IndexedAxisVote = {
  record: AxisVote
}

const lexId = 'com.para.raq.axisVote'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: AxisVoteRecord,
  timestamp: string,
): Promise<IndexedAxisVote | null> => {
  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    axisId: obj.axisId,
    value: obj.value ?? 0,
    voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
    eligibilityProofRef: normalizeOpaqueProofField(obj.eligibilityProofRef, 512),
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  const existing = record.voteNullifier
    ? await db
        .selectFrom('raq_axis_vote')
        .where('axisId', '=', record.axisId)
        .where('voteNullifier', '=', record.voteNullifier)
        .select(['uri'])
        .executeTakeFirst()
    : await db
        .selectFrom('raq_axis_vote')
        .where('creator', '=', record.creator)
        .where('axisId', '=', record.axisId)
        .select(['uri'])
        .executeTakeFirst()

  const inserted = existing
    ? await db
        .updateTable('raq_axis_vote')
        .set(record)
        .where('uri', '=', existing.uri)
        .returningAll()
        .executeTakeFirst()
    : await db
        .insertInto('raq_axis_vote')
        .values(record)
        .returningAll()
        .executeTakeFirst()

  if (!inserted) return null
  return { record: inserted }
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const normalizeOpaqueProofField = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedAxisVote | null> => {
  const deleted = await db
    .deleteFrom('raq_axis_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (
  deleted: IndexedAxisVote,
  _replacedBy: IndexedAxisVote | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

export type PluginType = RecordProcessor<AxisVoteRecord, IndexedAxisVote>

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
