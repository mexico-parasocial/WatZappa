// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'
import { recomputeCabildeoAggregates } from './recompute-cabildeo-aggregates.js'

interface DelegationRecord {
  cabildeo?: string
  delegateTo?: string
  mode?: 'active' | 'passive'
  party?: string
  community?: string
  scopeFlairs?: string[]
  preferredOption?: number
  signal?: number
  reason?: string
  createdAt: string
}

type CabildeoDelegation = Selectable<DatabaseSchemaType['cabildeo_delegation']>
type IndexedDelegation = {
  record: CabildeoDelegation
}

const lexId = 'com.para.civic.delegation'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: DelegationRecord,
  timestamp: string,
): Promise<IndexedDelegation | null> => {
  const mode = obj.mode || 'active'
  if (!isValidCessionRecord(obj, mode)) {
    return null
  }

  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    cabildeo: obj.cabildeo || null,
    delegateTo: obj.delegateTo || null,
    mode,
    party: obj.party || null,
    community: obj.community || null,
    scopeFlairs: obj.scopeFlairs?.length
      ? sql<string[]>`${JSON.stringify(obj.scopeFlairs)}`
      : null,
    preferredOption:
      typeof obj.preferredOption === 'number' ? obj.preferredOption : null,
    signal: typeof obj.signal === 'number' ? obj.signal : null,
    reason: obj.reason || null,
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  const inserted = await db
    .insertInto('cabildeo_delegation')
    .values(record)
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  if (!inserted) {
    return null
  }

  return { record: inserted }
}

const isValidCessionRecord = (
  obj: DelegationRecord,
  mode: 'active' | 'passive',
) => {
  if (mode === 'active') {
    // Must have a delegate. Must have EITHER a specific cabildeo OR scope flairs for expertise.
    if (!obj.delegateTo) return false
    if (!obj.cabildeo && (!obj.scopeFlairs || obj.scopeFlairs.length === 0)) {
      return false
    }
    const criteriaCount =
      (typeof obj.preferredOption === 'number' ? 1 : 0) +
      (typeof obj.reason === 'string' && obj.reason.trim().length > 0 ? 1 : 0) +
      (typeof obj.signal === 'number' ? 1 : 0)
    return criteriaCount >= 2
  }

  return Boolean(
    obj.party?.trim() &&
      obj.community?.trim() &&
      obj.scopeFlairs?.some((item) => item.trim().length > 0),
  )
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
): Promise<IndexedDelegation | null> => {
  const deleted = await db
    .deleteFrom('cabildeo_delegation')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForDelete = (
  deleted: IndexedDelegation,
  _replacedBy: IndexedDelegation | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

const updateAggregates = async (
  db: DatabaseSchema,
  indexed: IndexedDelegation,
) => {
  const cabildeoUri = indexed.record.cabildeo
  if (!cabildeoUri) return
  await recomputeCabildeoAggregates(db, cabildeoUri)
}

export type PluginType = RecordProcessor<DelegationRecord, IndexedDelegation>

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
