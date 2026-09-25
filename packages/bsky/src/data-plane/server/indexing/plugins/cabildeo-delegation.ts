// @ts-nocheck
import { type Selectable, sql } from 'kysely'
import type { CID } from 'multiformats/cid'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'
import { finalizeDueCabildeos } from './finalize-cabildeos.js'
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
  eligibilityProofRef?: string
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
    eligibilityProofRef: obj.eligibilityProofRef || null,
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
  if (
    !obj.delegateTo?.startsWith('did:') ||
    !obj.eligibilityProofRef ||
    obj.signal !== undefined
  )
    return false
  if (mode === 'active') {
    return Boolean(obj.cabildeo?.startsWith('at://'))
  }

  return Boolean(
    !obj.cabildeo &&
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
  await finalizeDueCabildeos(db)
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
  if (cabildeoUri) {
    await recomputeCabildeoAggregates(db, cabildeoUri)
    return
  }
  const open = await db
    .selectFrom('cabildeo_cabildeo')
    .where('phase', '=', 'voting')
    .where('community', '=', indexed.record.community ?? '')
    .select(['uri', 'flairs'])
    .execute()
  for (const cabildeo of open) {
    if (
      cabildeo.flairs?.some((flair) =>
        indexed.record.scopeFlairs?.some(
          (scopeFlair) =>
            scopeFlair.trim().toLowerCase() === flair.trim().toLowerCase(),
        ),
      )
    ) {
      await recomputeCabildeoAggregates(db, cabildeo.uri)
    }
  }
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
