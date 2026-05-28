// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'
import { recomputeCabildeoAggregates } from './recompute-cabildeo-aggregates.js'

interface CabildeoRecord {
  title: string
  description: string
  community: string
  communities?: string[]
  flairs?: string[]
  region?: string
  geoRestricted?: boolean
  options: unknown
  minQuorum?: number
  voteVisibility?: string
  phase: string
  phaseDeadline?: string
  createdAt: string
}

type CabildeoCabildeo = Selectable<DatabaseSchemaType['cabildeo_cabildeo']>
type IndexedCabildeo = {
  record: CabildeoCabildeo
}

const lexId = 'com.para.civic.cabildeo'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: CabildeoRecord,
  timestamp: string,
): Promise<IndexedCabildeo | null> => {
  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    title: obj.title,
    description: obj.description,
    community: obj.community,
    communities: obj.communities?.length
      ? sql<string[]>`${JSON.stringify(obj.communities)}`
      : null,
    flairs: obj.flairs?.length
      ? sql<string[]>`${JSON.stringify(obj.flairs)}`
      : null,
    region: obj.region || null,
    geoRestricted: obj.geoRestricted ? (1 as const) : (0 as const),
    options: sql`${JSON.stringify(obj.options)}`,
    minQuorum: obj.minQuorum || null,
    voteVisibility: normalizeVoteVisibility(obj.voteVisibility),
    phase: obj.phase,
    phaseDeadline: obj.phaseDeadline || null,
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    positionCount: 0,
    positionForCount: 0,
    positionAgainstCount: 0,
    positionAmendmentCount: 0,
    voteCount: 0,
    directVoteCount: 0,
    delegatedVoteCount: 0,
    delegationCount: 0,
    optionVoteCounts: sql<number[]>`'[]'::jsonb`,
    optionPositionCounts: sql<number[]>`'[]'::jsonb`,
    winningOption: null,
    isTie: 0 as 0 | 1,
    indexedAt: timestamp,
  }

  const inserted = await db
    .insertInto('cabildeo_cabildeo')
    .values(record)
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  if (!inserted) {
    return null
  }

  return { record: inserted }
}

const normalizeVoteVisibility = (value: unknown) =>
  value === 'party_only' || value === 'anonymous' ? value : 'public'

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const notifsForInsert = () => {
  return []
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedCabildeo | null> => {
  const deleted = await db
    .deleteFrom('cabildeo_cabildeo')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForDelete = (
  deleted: IndexedCabildeo,
  _replacedBy: IndexedCabildeo | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

const updateAggregates = async (
  db: DatabaseSchema,
  indexed: IndexedCabildeo,
) => {
  await recomputeCabildeoAggregates(db, indexed.record.uri)
}

export type PluginType = RecordProcessor<CabildeoRecord, IndexedCabildeo>

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
