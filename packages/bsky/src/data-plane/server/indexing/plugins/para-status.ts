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
import { RecordProcessor } from '../processor.js'
import { finalizeDueCabildeos } from './finalize-cabildeos.js'
import { recomputeCabildeoAggregates } from './recompute-cabildeo-aggregates.js'

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
  await finalizeDueCabildeos(db)

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
  await finalizeDueCabildeos(db)
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

const updateAggregates = async (
  db: DatabaseSchema,
  status: IndexedParaStatus,
) => {
  const standing = await db
    .selectFrom('cabildeo_delegation')
    .where('mode', '=', 'passive')
    .where('delegateTo', '=', status.did)
    .select('uri')
    .limit(1)
    .executeTakeFirst()
  if (!standing) return
  const open = await db
    .selectFrom('cabildeo_cabildeo')
    .where('phase', '=', 'voting')
    .select('uri')
    .execute()
  for (const row of open) await recomputeCabildeoAggregates(db, row.uri)
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
    updateAggregates,
  })
}

export default makePlugin
