// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface IntensityRecord {
  proposal: string
  voter: string
  signal: number
  units: number
  creditsSpent?: number
  delegatedFrom?: string[]
  delegationDepth?: number
  effectiveWeight?: string
  voteNullifier?: string
  eligibilityProofRef?: string
  createdAt: string
}

type ParaQvldIntensity = Selectable<DatabaseSchemaType['para_qvld_intensity']>

const lexId = 'com.para.community.intensity'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: IntensityRecord,
  timestamp: string,
): Promise<ParaQvldIntensity | null> => {
  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    proposal: obj.proposal,
    voter: obj.voter,
    signal: obj.signal,
    units: obj.units,
    creditsSpent: obj.creditsSpent ?? obj.units,
    delegatedFrom: obj.delegatedFrom?.length
      ? sql<string[]>`${JSON.stringify(obj.delegatedFrom)}`
      : null,
    delegationDepth: obj.delegationDepth ?? 0,
    effectiveWeight: obj.effectiveWeight ?? null,
    voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
    eligibilityProofRef: normalizeOpaqueProofField(obj.eligibilityProofRef, 512),
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  const existing = record.voteNullifier
    ? await db
        .selectFrom('para_qvld_intensity')
        .where('proposal', '=', record.proposal)
        .where('voteNullifier', '=', record.voteNullifier)
        .select(['uri'])
        .executeTakeFirst()
    : await db
        .selectFrom('para_qvld_intensity')
        .where('creator', '=', record.creator)
        .where('proposal', '=', record.proposal)
        .select(['uri'])
        .executeTakeFirst()

  const inserted = existing
    ? await db
        .updateTable('para_qvld_intensity')
        .set(record)
        .where('uri', '=', existing.uri)
        .returningAll()
        .executeTakeFirst()
    : await db
        .insertInto('para_qvld_intensity')
        .values(record)
        .returningAll()
        .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => null

const normalizeOpaqueProofField = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<ParaQvldIntensity | null> => {
  const deleted = await db
    .deleteFrom('para_qvld_intensity')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (deleted: ParaQvldIntensity) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = RecordProcessor<IntensityRecord, ParaQvldIntensity>

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
